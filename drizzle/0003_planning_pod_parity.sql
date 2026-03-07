CREATE TABLE IF NOT EXISTS `contracts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `owner_id` int NOT NULL,
  `booking_id` int,
  `lead_id` int,
  `title` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `status` enum('draft','sent','signed','declined','expired') NOT NULL DEFAULT 'draft',
  `client_name` varchar(255),
  `client_email` varchar(255),
  `signed_at` bigint,
  `signature_data` text,
  `signer_ip` varchar(100),
  `signer_name` varchar(255),
  `sent_at` bigint,
  `expires_at` bigint,
  `token` varchar(100),
  `created_at` bigint NOT NULL,
  `updated_at` bigint NOT NULL,
  CONSTRAINT `contracts_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `event_budgets` (
  `id` int AUTO_INCREMENT NOT NULL,
  `owner_id` int NOT NULL,
  `booking_id` int,
  `lead_id` int,
  `name` varchar(255) NOT NULL,
  `category` varchar(100) NOT NULL DEFAULT 'other',
  `type` enum('income','expense') NOT NULL DEFAULT 'expense',
  `estimated_amount` int NOT NULL DEFAULT 0,
  `actual_amount` int DEFAULT 0,
  `notes` text,
  `is_paid` boolean NOT NULL DEFAULT false,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` bigint NOT NULL,
  CONSTRAINT `event_budgets_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `equipment` (
  `id` int AUTO_INCREMENT NOT NULL,
  `owner_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `category` varchar(100) NOT NULL DEFAULT 'other',
  `description` text,
  `quantity` int NOT NULL DEFAULT 1,
  `unit` varchar(50) DEFAULT 'item',
  `notes` text,
  `created_at` bigint NOT NULL,
  CONSTRAINT `equipment_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `event_equipment` (
  `id` int AUTO_INCREMENT NOT NULL,
  `owner_id` int NOT NULL,
  `booking_id` int,
  `lead_id` int,
  `equipment_id` int,
  `name` varchar(255) NOT NULL,
  `category` varchar(100) NOT NULL DEFAULT 'other',
  `quantity` int NOT NULL DEFAULT 1,
  `notes` text,
  `status` enum('needed','confirmed','delivered','returned') NOT NULL DEFAULT 'needed',
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` bigint NOT NULL,
  CONSTRAINT `event_equipment_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `communications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `owner_id` int NOT NULL,
  `booking_id` int,
  `lead_id` int,
  `type` enum('note','email','call','sms','meeting') NOT NULL DEFAULT 'note',
  `subject` varchar(255),
  `body` text NOT NULL,
  `direction` enum('inbound','outbound','internal') NOT NULL DEFAULT 'internal',
  `contact_name` varchar(255),
  `contact_email` varchar(255),
  `created_at` bigint NOT NULL,
  CONSTRAINT `communications_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `seating_charts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `owner_id` int NOT NULL,
  `booking_id` int,
  `lead_id` int,
  `name` varchar(255) NOT NULL DEFAULT 'Seating Chart',
  `canvas_data` text,
  `guest_count` int NOT NULL DEFAULT 0,
  `created_at` bigint NOT NULL,
  `updated_at` bigint NOT NULL,
  CONSTRAINT `seating_charts_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `client_portal_tokens` (
  `id` int AUTO_INCREMENT NOT NULL,
  `owner_id` int NOT NULL,
  `booking_id` int,
  `lead_id` int,
  `token` varchar(100) NOT NULL,
  `client_name` varchar(255),
  `client_email` varchar(255),
  `permissions` text,
  `expires_at` bigint,
  `last_accessed_at` bigint,
  `created_at` bigint NOT NULL,
  CONSTRAINT `client_portal_tokens_id` PRIMARY KEY(`id`)
);
