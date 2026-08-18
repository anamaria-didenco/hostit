-- Xero integration: per-owner OAuth connection + pushed-invoice ledger.
CREATE TABLE IF NOT EXISTS "xero_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "ownerId" integer NOT NULL,
  "tenantId" varchar(64),
  "tenantName" varchar(255),
  "accessToken" text,
  "refreshToken" text,
  "expiresAt" timestamp,
  "salesAccountCode" varchar(20) DEFAULT '200',
  "lineAmountsInclusive" boolean DEFAULT true NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "xero_connections_ownerId_unique" UNIQUE("ownerId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "xero_invoices" (
  "id" serial PRIMARY KEY NOT NULL,
  "ownerId" integer NOT NULL,
  "bookingId" integer NOT NULL,
  "stream" varchar(10) NOT NULL,
  "xeroInvoiceId" varchar(64),
  "invoiceNumber" varchar(50),
  "status" varchar(20),
  "total" numeric(10, 2),
  "createdAt" timestamp DEFAULT now() NOT NULL
);
