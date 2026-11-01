CREATE TABLE `blocked_users` (
	`userId` int NOT NULL,
	`blockedUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blocked_users_userId_blockedUserId_pk` PRIMARY KEY(`userId`,`blockedUserId`)
);
--> statement-breakpoint
CREATE TABLE `hidden_contacts` (
	`userId` int NOT NULL,
	`targetUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hidden_contacts_userId_targetUserId_pk` PRIMARY KEY(`userId`,`targetUserId`)
);
--> statement-breakpoint
CREATE TABLE `message_reactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`userId` int NOT NULL,
	`emoji` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `message_reactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `message_user_reaction_idx` UNIQUE(`messageId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `muted_conversations` (
	`userId` int NOT NULL,
	`conversationId` int NOT NULL,
	`mutedUntil` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `muted_conversations_userId_conversationId_pk` PRIMARY KEY(`userId`,`conversationId`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `nickname` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_nickname_unique` UNIQUE(`nickname`);--> statement-breakpoint
ALTER TABLE `blocked_users` ADD CONSTRAINT `blocked_users_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `blocked_users` ADD CONSTRAINT `blocked_users_blockedUserId_users_id_fk` FOREIGN KEY (`blockedUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hidden_contacts` ADD CONSTRAINT `hidden_contacts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hidden_contacts` ADD CONSTRAINT `hidden_contacts_targetUserId_users_id_fk` FOREIGN KEY (`targetUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `message_reactions` ADD CONSTRAINT `message_reactions_messageId_messages_id_fk` FOREIGN KEY (`messageId`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `message_reactions` ADD CONSTRAINT `message_reactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `muted_conversations` ADD CONSTRAINT `muted_conversations_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `muted_conversations` ADD CONSTRAINT `muted_conversations_conversationId_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `reaction_msg_idx` ON `message_reactions` (`messageId`);