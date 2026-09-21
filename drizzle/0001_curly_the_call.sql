CREATE TABLE `call_signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`callId` int NOT NULL,
	`senderId` int NOT NULL,
	`receiverId` int NOT NULL,
	`kind` enum('offer','answer','candidate','hangup') NOT NULL,
	`payload` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `call_signals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `calls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`callerId` int NOT NULL,
	`receiverId` int NOT NULL,
	`type` enum('audio','video') NOT NULL,
	`status` enum('ringing','connecting','active','ended','declined','missed','failed') NOT NULL DEFAULT 'ringing',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`answeredAt` timestamp,
	`endedAt` timestamp,
	`duration` int NOT NULL DEFAULT 0,
	CONSTRAINT `calls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversation_members` (
	`conversationId` int NOT NULL,
	`userId` int NOT NULL,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`lastReadAt` timestamp,
	CONSTRAINT `conversation_members_conversationId_userId_pk` PRIMARY KEY(`conversationId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('direct','group') NOT NULL DEFAULT 'direct',
	`directKey` varchar(64),
	`title` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`),
	CONSTRAINT `conversations_directKey_unique` UNIQUE(`directKey`)
);
--> statement-breakpoint
CREATE TABLE `message_status` (
	`messageId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('sent','delivered','read') NOT NULL DEFAULT 'sent',
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `message_status_messageId_userId_pk` PRIMARY KEY(`messageId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`senderId` int NOT NULL,
	`messageType` enum('text','image','audio','file','system') NOT NULL DEFAULT 'text',
	`content` text,
	`fileKey` varchar(512),
	`fileUrl` varchar(1024),
	`fileName` varchar(255),
	`fileSize` int,
	`mimeType` varchar(128),
	`duration` int,
	`replyToId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `typing_states` (
	`conversationId` int NOT NULL,
	`userId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `typing_states_conversationId_userId_pk` PRIMARY KEY(`conversationId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` varchar(120);--> statement-breakpoint
ALTER TABLE `users` ADD `avatarKey` varchar(512);--> statement-breakpoint
ALTER TABLE `users` ADD `avatarUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `users` ADD `status` varchar(280) DEFAULT 'Disponível' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lastSeen` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `call_signals` ADD CONSTRAINT `call_signals_callId_calls_id_fk` FOREIGN KEY (`callId`) REFERENCES `calls`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `call_signals` ADD CONSTRAINT `call_signals_senderId_users_id_fk` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `call_signals` ADD CONSTRAINT `call_signals_receiverId_users_id_fk` FOREIGN KEY (`receiverId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calls` ADD CONSTRAINT `calls_conversationId_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calls` ADD CONSTRAINT `calls_callerId_users_id_fk` FOREIGN KEY (`callerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calls` ADD CONSTRAINT `calls_receiverId_users_id_fk` FOREIGN KEY (`receiverId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversation_members` ADD CONSTRAINT `conversation_members_conversationId_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversation_members` ADD CONSTRAINT `conversation_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `message_status` ADD CONSTRAINT `message_status_messageId_messages_id_fk` FOREIGN KEY (`messageId`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `message_status` ADD CONSTRAINT `message_status_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversationId_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_senderId_users_id_fk` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `typing_states` ADD CONSTRAINT `typing_states_conversationId_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `typing_states` ADD CONSTRAINT `typing_states_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `signals_receiver_idx` ON `call_signals` (`receiverId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `calls_receiver_status_idx` ON `calls` (`receiverId`,`status`);--> statement-breakpoint
CREATE INDEX `calls_conversation_idx` ON `calls` (`conversationId`,`startedAt`);--> statement-breakpoint
CREATE INDEX `members_user_idx` ON `conversation_members` (`userId`);--> statement-breakpoint
CREATE INDEX `conversations_activity_idx` ON `conversations` (`updatedAt`);--> statement-breakpoint
CREATE INDEX `status_user_idx` ON `message_status` (`userId`);--> statement-breakpoint
CREATE INDEX `messages_conversation_created_idx` ON `messages` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `messages_sender_idx` ON `messages` (`senderId`);--> statement-breakpoint
CREATE INDEX `typing_expiry_idx` ON `typing_states` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `users_name_idx` ON `users` (`name`);