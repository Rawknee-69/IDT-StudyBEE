CREATE TABLE "material_topics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" varchar NOT NULL,
	"topics" jsonb NOT NULL,
	"extracted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "youtube_recommendations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" varchar NOT NULL,
	"topic" text NOT NULL,
	"video_id" varchar NOT NULL,
	"title" text NOT NULL,
	"channel_title" text NOT NULL,
	"thumbnail" text NOT NULL,
	"description" text,
	"view_count" integer,
	"duration" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_materials" ADD COLUMN "gemini_file_uri" text;--> statement-breakpoint
ALTER TABLE "material_topics" ADD CONSTRAINT "material_topics_material_id_study_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."study_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_recommendations" ADD CONSTRAINT "youtube_recommendations_material_id_study_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."study_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_material_topics_material" ON "material_topics" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_youtube_recommendations_material" ON "youtube_recommendations" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_youtube_recommendations_material_topic" ON "youtube_recommendations" USING btree ("material_id","topic");