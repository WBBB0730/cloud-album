ALTER TABLE "account_invites" ADD COLUMN "token" text;--> statement-breakpoint
CREATE UNIQUE INDEX "account_invites_token_unique" ON "account_invites" USING btree ("token");
