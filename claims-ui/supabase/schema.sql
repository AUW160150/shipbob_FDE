-- Run this in the Supabase SQL editor after creating your project.
-- Dashboard → SQL Editor → New Query → paste & run.

create table if not exists dead_claims (
  id            bigint generated always as identity primary key,
  case_id       text not null,
  case_number   text,
  account_name  text,
  delivered_date date,
  filed_date    date,
  days_late     int,
  reason        text,
  created_at    timestamptz default now()
);

create table if not exists insured_claims (
  id            bigint generated always as identity primary key,
  case_id       text not null,
  case_number   text,
  account_name  text,
  carrier       text,
  tracking_number text,
  shipment_id   text,
  created_at    timestamptz default now()
);

create table if not exists incomplete_claims (
  id              bigint generated always as identity primary key,
  case_id         text not null,
  case_number     text,
  account_name    text,
  missing_fields  text[],
  email_sent_at   timestamptz,
  created_at      timestamptz default now()
);

create table if not exists auto_emails_log (
  id           bigint generated always as identity primary key,
  case_id      text not null,
  case_number  text,
  email_type   text,   -- 'incomplete_claim' | 'missing_evidence'
  recipient    text,
  status       text,   -- 'sent' | 'error'
  error        text,
  created_at   timestamptz default now()
);

create table if not exists waiting_claims (
  id              bigint generated always as identity primary key,
  case_id         text not null,
  case_number     text,
  account_name    text,
  missing_evidence text[],
  email_sent_at   timestamptz,
  created_at      timestamptz default now()
);
