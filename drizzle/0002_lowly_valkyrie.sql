CREATE TABLE `message_deletions` (
	`messageId` int NOT NULL,
	`userId` int NOT NULL,
	`deletedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `message_deletions_messageId_userId_pk` PRIMARY KEY(`messageId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `message_deletions` ADD CONSTRAINT `message_deletions_messageId_messages_id_fk` FOREIGN KEY (`messageId`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `message_deletions` ADD CONSTRAINT `message_deletions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `deletions_user_idx` ON `message_deletions` (`userId`);