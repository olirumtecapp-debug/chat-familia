ALTER TABLE `conversation_members` ADD `memberRole` enum('member','admin') DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `groupOwnerId` int;--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_groupOwnerId_users_id_fk` FOREIGN KEY (`groupOwnerId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;