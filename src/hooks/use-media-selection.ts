"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type Touch,
  type TouchEvent,
} from "react"

const ENTER_SELECTION_LONG_PRESS_MS = 800
const DRAG_SELECT_LONG_PRESS_MS = 500
const DRAG_SELECT_START_THRESHOLD = 8
const ENTER_SELECTION_CANCEL_THRESHOLD = 18
const DRAG_SELECT_SCROLL_EDGE = 56
const DRAG_SELECT_MAX_SCROLL_SPEED = 12

type TouchCollection = {
  length: number
  item: (index: number) => Touch | globalThis.Touch | null
}

type DragSelectState = {
  active: boolean
  select: boolean
  anchorId: string | null
  currentId: string | null
  baseSelectedIds: Set<string>
  lastX: number
  lastY: number
  scrollFrame: number | null
}

type PendingDragSelect = {
  mediaId: string
  select: boolean
  ready: boolean
  startX: number
  startY: number
  lastX: number
  lastY: number
} | null

const createEmptyDragState = (): DragSelectState => ({
  active: false,
  select: true,
  anchorId: null,
  currentId: null,
  baseSelectedIds: new Set(),
  lastX: 0,
  lastY: 0,
  scrollFrame: null,
})

export function useMediaSelection(orderedIds: string[]) {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const scrollSectionRef = useRef<HTMLDivElement | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const dragSelectLongPressTimerRef = useRef<number | null>(null)
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
  const activeTouchIdRef = useRef<number | null>(null)
  const dragSelectRef = useRef<DragSelectState>(createEmptyDragState())
  const pendingDragSelectRef = useRef<PendingDragSelect>(null)
  const ignoreNextClickRef = useRef(false)

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    longPressStartRef.current = null
  }, [])

  const clearSelection = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  const getDragRangeIds = useCallback((anchorId: string, currentId: string) => {
    const anchorIndex = orderedIds.indexOf(anchorId)
    const currentIndex = orderedIds.indexOf(currentId)

    if (anchorIndex < 0 || currentIndex < 0) {
      return [anchorId]
    }

    const startIndex = Math.min(anchorIndex, currentIndex)
    const endIndex = Math.max(anchorIndex, currentIndex)

    return orderedIds.slice(startIndex, endIndex + 1)
  }, [orderedIds])

  const applyDragSelectionRange = useCallback((currentId: string) => {
    const dragState = dragSelectRef.current

    if (!dragState.active || !dragState.anchorId) {
      return
    }

    const anchorId = dragState.anchorId

    dragState.currentId = currentId
    setSelectedIds(() => {
      const next = new Set(dragState.baseSelectedIds)
      const rangeIds = getDragRangeIds(anchorId, currentId)

      for (const id of rangeIds) {
        if (dragState.select) {
          next.add(id)
        } else {
          next.delete(id)
        }
      }

      return next
    })
  }, [getDragRangeIds])

  const getMediaIdAtPoint = useCallback((clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY)
    const mediaElement = element?.closest<HTMLElement>("[data-media-id]")

    return mediaElement?.dataset.mediaId ?? null
  }, [])

  const getMediaElementById = useCallback((mediaId: string) => {
    const root = scrollSectionRef.current ?? document
    const mediaElements = root.querySelectorAll<HTMLElement>("[data-media-id]")

    for (const mediaElement of Array.from(mediaElements)) {
      if (mediaElement.dataset.mediaId === mediaId) {
        return mediaElement
      }
    }

    return null
  }, [])

  const keepMediaPositionAfterLayoutChange = useCallback((mediaId: string) => {
    const scroller = scrollSectionRef.current
    const beforeRect = getMediaElementById(mediaId)?.getBoundingClientRect()

    if (!scroller || !beforeRect) {
      return
    }

    window.requestAnimationFrame(() => {
      const afterRect = getMediaElementById(mediaId)?.getBoundingClientRect()

      if (!afterRect) {
        return
      }

      const deltaY = afterRect.top - beforeRect.top

      if (Math.abs(deltaY) > 0.5) {
        scroller.scrollTop += deltaY
      }
    })
  }, [getMediaElementById])

  const stopDragAutoScroll = useCallback(() => {
    const frame = dragSelectRef.current.scrollFrame

    if (frame !== null) {
      window.cancelAnimationFrame(frame)
      dragSelectRef.current.scrollFrame = null
    }
  }, [])

  const runDragAutoScroll = useCallback(function tick() {
    const dragState = dragSelectRef.current
    const scroller = scrollSectionRef.current

    if (!dragState.active || !scroller) {
      dragState.scrollFrame = null
      return
    }

    const rect = scroller.getBoundingClientRect()
    const topDistance = dragState.lastY - rect.top
    const bottomDistance = rect.bottom - dragState.lastY
    let scrollDelta = 0

    if (topDistance >= 0 && topDistance < DRAG_SELECT_SCROLL_EDGE) {
      scrollDelta = -Math.ceil(
        ((DRAG_SELECT_SCROLL_EDGE - topDistance) / DRAG_SELECT_SCROLL_EDGE) *
          DRAG_SELECT_MAX_SCROLL_SPEED
      )
    } else if (bottomDistance >= 0 && bottomDistance < DRAG_SELECT_SCROLL_EDGE) {
      scrollDelta = Math.ceil(
        ((DRAG_SELECT_SCROLL_EDGE - bottomDistance) / DRAG_SELECT_SCROLL_EDGE) *
          DRAG_SELECT_MAX_SCROLL_SPEED
      )
    }

    if (scrollDelta !== 0) {
      scroller.scrollTop += scrollDelta
      const mediaId = getMediaIdAtPoint(dragState.lastX, dragState.lastY)

      if (mediaId && mediaId !== dragState.currentId) {
        applyDragSelectionRange(mediaId)
      }
    }

    dragState.scrollFrame = window.requestAnimationFrame(tick)
  }, [applyDragSelectionRange, getMediaIdAtPoint])

  const beginDragSelect = useCallback((mediaId: string, select: boolean, clientX: number, clientY: number) => {
    stopDragAutoScroll()
    dragSelectRef.current = {
      active: true,
      select,
      anchorId: mediaId,
      currentId: mediaId,
      baseSelectedIds: new Set(selectedIds),
      lastX: clientX,
      lastY: clientY,
      scrollFrame: null,
    }
    ignoreNextClickRef.current = true
    setSelectionMode(true)
    applyDragSelectionRange(mediaId)
    dragSelectRef.current.scrollFrame = window.requestAnimationFrame(runDragAutoScroll)
  }, [applyDragSelectionRange, runDragAutoScroll, selectedIds, stopDragAutoScroll])

  const updateDragSelect = useCallback((clientX: number, clientY: number) => {
    const dragState = dragSelectRef.current

    if (!dragState.active) {
      return false
    }

    dragState.lastX = clientX
    dragState.lastY = clientY

    const mediaId = getMediaIdAtPoint(clientX, clientY)

    if (mediaId && mediaId !== dragState.currentId) {
      applyDragSelectionRange(mediaId)
    }

    return true
  }, [applyDragSelectionRange, getMediaIdAtPoint])

  const stopDragSelect = useCallback(() => {
    dragSelectRef.current.active = false
    dragSelectRef.current.anchorId = null
    dragSelectRef.current.currentId = null
    dragSelectRef.current.baseSelectedIds = new Set()
    stopDragAutoScroll()
  }, [stopDragAutoScroll])

  const cancelPendingDragSelect = useCallback(() => {
    if (dragSelectLongPressTimerRef.current !== null) {
      window.clearTimeout(dragSelectLongPressTimerRef.current)
      dragSelectLongPressTimerRef.current = null
    }

    pendingDragSelectRef.current = null
  }, [])

  const stopSelectionPointers = useCallback(() => {
    cancelPendingDragSelect()
    stopDragSelect()
    clearLongPressTimer()
    activeTouchIdRef.current = null
  }, [cancelPendingDragSelect, clearLongPressTimer, stopDragSelect])

  const enterSelectionOnly = useCallback((mediaId: string) => {
    keepMediaPositionAfterLayoutChange(mediaId)
    ignoreNextClickRef.current = true
    setSelectionMode(true)
    setSelectedIds((current) => {
      if (current.has(mediaId)) {
        return current
      }

      const next = new Set(current)

      next.add(mediaId)
      return next
    })
  }, [keepMediaPositionAfterLayoutChange])

  const findActiveTouch = useCallback((touches: TouchCollection) => {
    const activeTouchId = activeTouchIdRef.current

    if (activeTouchId === null) {
      return null
    }

    for (let index = 0; index < touches.length; index += 1) {
      const touch = touches.item(index)

      if (touch?.identifier === activeTouchId) {
        return touch
      }
    }

    return null
  }, [])

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    const pendingDragSelect = pendingDragSelectRef.current

    if (pendingDragSelect) {
      const deltaX = clientX - pendingDragSelect.startX
      const deltaY = clientY - pendingDragSelect.startY

      pendingDragSelect.lastX = clientX
      pendingDragSelect.lastY = clientY

      if (Math.hypot(deltaX, deltaY) < DRAG_SELECT_START_THRESHOLD) {
        return false
      }

      if (!pendingDragSelect.ready) {
        cancelPendingDragSelect()
        return false
      }

      beginDragSelect(pendingDragSelect.mediaId, pendingDragSelect.select, clientX, clientY)
      cancelPendingDragSelect()
      updateDragSelect(clientX, clientY)
      return true
    }

    if (dragSelectRef.current.active) {
      updateDragSelect(clientX, clientY)
      return true
    }

    return false
  }, [beginDragSelect, cancelPendingDragSelect, updateDragSelect])

  const toggleSelection = useCallback((mediaId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)

      if (next.has(mediaId)) {
        next.delete(mediaId)
      } else {
        next.add(mediaId)
      }

      return next
    })
  }, [])

  const toggleGroupSelection = useCallback((ids: string[]) => {
    setSelectedIds((current) => {
      const groupIds = ids.filter(Boolean)
      const allSelected = groupIds.every((id) => current.has(id))
      const next = new Set(current)

      for (const id of groupIds) {
        if (allSelected) {
          next.delete(id)
        } else {
          next.add(id)
        }
      }

      return next
    })
  }, [])

  const toggleAllSelection = useCallback(() => {
    setSelectedIds((current) => {
      if (orderedIds.length === 0) {
        return current
      }

      if (orderedIds.every((id) => current.has(id))) {
        return new Set()
      }

    return new Set(orderedIds)
    })
  }, [orderedIds])

  const applySingleSelection = useCallback((mediaId: string, select: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)

      if (select) {
        next.add(mediaId)
      } else {
        next.delete(mediaId)
      }

      return next
    })
  }, [])

  const scheduleDragSelectLongPress = useCallback((mediaId: string, select: boolean, clientX: number, clientY: number) => {
    cancelPendingDragSelect()
    pendingDragSelectRef.current = {
      mediaId,
      select,
      ready: false,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
    }
    dragSelectLongPressTimerRef.current = window.setTimeout(() => {
      const pendingDragSelect = pendingDragSelectRef.current

      dragSelectLongPressTimerRef.current = null

      if (!pendingDragSelect) {
        return
      }

      pendingDragSelect.ready = true
      ignoreNextClickRef.current = true
      applySingleSelection(pendingDragSelect.mediaId, pendingDragSelect.select)
    }, DRAG_SELECT_LONG_PRESS_MS)
  }, [applySingleSelection, cancelPendingDragSelect])

  const scheduleLongPress = useCallback((mediaId: string, clientX: number, clientY: number) => {
    clearLongPressTimer()
    longPressStartRef.current = { x: clientX, y: clientY }
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null
      longPressStartRef.current = null
      enterSelectionOnly(mediaId)
    }, ENTER_SELECTION_LONG_PRESS_MS)
  }, [clearLongPressTimer, enterSelectionOnly])

  const consumeClickSuppression = useCallback(() => {
    if (!ignoreNextClickRef.current) {
      return false
    }

    ignoreNextClickRef.current = false
    return true
  }, [])

  const getMediaPointerHandlers = useCallback((mediaId: string, selected: boolean) => ({
    "data-media-id": mediaId,
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "touch" || event.button !== 0) {
        return
      }

      if (selectionMode) {
        scheduleDragSelectLongPress(mediaId, !selected, event.clientX, event.clientY)
        return
      }

      scheduleLongPress(mediaId, event.clientX, event.clientY)
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "touch") {
        return
      }

      if (handleDragMove(event.clientX, event.clientY)) {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        return
      }

      const start = longPressStartRef.current

      if (!start) {
        return
      }

      if (
        Math.abs(event.clientX - start.x) > ENTER_SELECTION_CANCEL_THRESHOLD ||
        Math.abs(event.clientY - start.y) > ENTER_SELECTION_CANCEL_THRESHOLD
      ) {
        clearLongPressTimer()
      }
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "touch") {
        return
      }

      const wasDragSelecting = dragSelectRef.current.active

      stopSelectionPointers()

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      if (wasDragSelecting) {
        ignoreNextClickRef.current = true
      }
    },
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "touch") {
        return
      }

      stopSelectionPointers()

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
    onTouchStart: (event: TouchEvent<HTMLButtonElement>) => {
      if (event.touches.length !== 1) {
        return
      }

      const touch = event.touches.item(0)

      if (!touch) {
        return
      }

      activeTouchIdRef.current = touch.identifier

      if (selectionMode) {
        scheduleDragSelectLongPress(mediaId, !selected, touch.clientX, touch.clientY)
        return
      }

      scheduleLongPress(mediaId, touch.clientX, touch.clientY)
    },
    onTouchMove: (event: TouchEvent<HTMLButtonElement>) => {
      const touch = findActiveTouch(event.touches)

      if (!touch) {
        return
      }

      if (handleDragMove(touch.clientX, touch.clientY)) {
        if (event.cancelable) {
          event.preventDefault()
        }
        return
      }

      const start = longPressStartRef.current

      if (!start) {
        return
      }

      if (
        Math.abs(touch.clientX - start.x) > ENTER_SELECTION_CANCEL_THRESHOLD ||
        Math.abs(touch.clientY - start.y) > ENTER_SELECTION_CANCEL_THRESHOLD
      ) {
        clearLongPressTimer()
      }
    },
    onTouchEnd: (event: TouchEvent<HTMLButtonElement>) => {
      if (!findActiveTouch(event.changedTouches)) {
        return
      }

      const wasDragSelecting = dragSelectRef.current.active

      stopSelectionPointers()

      if (wasDragSelecting) {
        ignoreNextClickRef.current = true
      }
    },
    onTouchCancel: (event: TouchEvent<HTMLButtonElement>) => {
      if (!findActiveTouch(event.changedTouches)) {
        return
      }

      stopSelectionPointers()
    },
    onContextMenu: (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      enterSelectionOnly(mediaId)
    },
  }), [
    clearLongPressTimer,
    enterSelectionOnly,
    findActiveTouch,
    handleDragMove,
    scheduleDragSelectLongPress,
    scheduleLongPress,
    selectionMode,
    stopSelectionPointers,
  ])

  useEffect(() => {
    const idSet = new Set(orderedIds)

    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => idSet.has(id)))
      return next.size === current.size ? current : next
    })
  }, [orderedIds])

  useEffect(() => () => stopSelectionPointers(), [stopSelectionPointers])

  return {
    allSelected: orderedIds.length > 0 && orderedIds.every((id) => selectedIds.has(id)),
    clearSelection,
    consumeClickSuppression,
    getMediaPointerHandlers,
    scrollSectionRef,
    selectedIds,
    selectionMode,
    setSelectedIds,
    setSelectionMode,
    toggleAllSelection,
    toggleGroupSelection,
    toggleSelection,
  }
}
