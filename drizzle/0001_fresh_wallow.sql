CREATE TABLE `availability` (
	`id` int AUTO_INCREMENT NOT NULL,
	`venueId` int NOT NULL,
	`date` timestamp NOT NULL,
	`isAvailable` boolean NOT NULL DEFAULT true,
	`note` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `availability_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inquiryId` int NOT NULL,
	`proposalId` int,
	`venueId` int NOT NULL,
	`plannerId` int,
	`plannerName` varchar(255) NOT NULL,
	`plannerEmail` varchar(320) NOT NULL,
	`eventDate` timestamp NOT NULL,
	`guestCount` int,
	`totalNzd` decimal(10,2),
	`depositPaid` boolean DEFAULT false,
	`status` enum('confirmed','pending_deposit','completed','cancelled') NOT NULL DEFAULT 'pending_deposit',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inquiries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`venueId` int NOT NULL,
	`plannerId` int,
	`plannerName` varchar(255) NOT NULL,
	`plannerEmail` varchar(320) NOT NULL,
	`plannerPhone` varchar(32),
	`eventType` varchar(100),
	`eventDate` timestamp,
	`guestCount` int,
	`message` text,
	`budget` decimal(10,2),
	`status` enum('new','viewed','responded','proposal_sent','booked','declined','cancelled') NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inquiries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inquiryId` int NOT NULL,
	`venueId` int NOT NULL,
	`ownerId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text,
	`eventDate` timestamp,
	`guestCount` int,
	`packageName` varchar(255),
	`lineItems` json DEFAULT ('[]'),
	`subtotal` decimal(10,2),
	`gstAmount` decimal(10,2),
	`totalNzd` decimal(10,2),
	`depositRequired` decimal(10,2),
	`validUntil` timestamp,
	`status` enum('draft','sent','viewed','accepted','declined','expired') NOT NULL DEFAULT 'draft',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `proposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `venues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`description` text,
	`shortDescription` varchar(500),
	`venueType` enum('restaurant','winery','rooftop_bar','heritage_building','garden','function_centre','hotel','beach','other') NOT NULL,
	`city` enum('Auckland','Wellington','Christchurch','Queenstown','Hamilton','Dunedin','Tauranga','Napier','Nelson','Rotorua') NOT NULL,
	`suburb` varchar(100),
	`address` text,
	`capacity` int NOT NULL,
	`minCapacity` int DEFAULT 10,
	`minPriceNzd` decimal(10,2),
	`maxPriceNzd` decimal(10,2),
	`pricePerHead` decimal(10,2),
	`amenities` json DEFAULT ('[]'),
	`images` json DEFAULT ('[]'),
	`coverImage` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`isFeatured` boolean NOT NULL DEFAULT false,
	`rating` decimal(3,1) DEFAULT '0.0',
	`reviewCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `venues_id` PRIMARY KEY(`id`),
	CONSTRAINT `venues_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `userType` enum('planner','owner') DEFAULT 'planner' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `company` text;