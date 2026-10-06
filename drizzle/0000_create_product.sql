CREATE TABLE "product" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(45) NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "product_name_not_blank" CHECK (length(btrim("product"."name")) > 0),
	CONSTRAINT "product_quantity_range" CHECK ("product"."quantity" between 0 and 999999999)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "product_name_unique" ON "product" USING btree (lower("name"));