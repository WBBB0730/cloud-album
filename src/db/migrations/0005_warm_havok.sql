DROP INDEX "media_cos_key_unique";--> statement-breakpoint
CREATE INDEX "media_cos_key_idx" ON "media" USING btree ("cos_key");