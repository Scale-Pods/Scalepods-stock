-- Structure that exists in the live database but not in the migration files (the mail tracker tables of the mail tracker). Generated, structure only.

alter type public.thread_category add value if not exists 'customer_inquiry';
alter type public.thread_category add value if not exists 'customer_order_ops';
alter type public.thread_category add value if not exists 'supplier_vendor';
alter type public.thread_category add value if not exists 'internal';
alter type public.thread_category add value if not exists 'advertising_newsletter';
alter type public.thread_category add value if not exists 'system_notification';
alter type public.thread_category add value if not exists 'spam_cold_outreach';
alter type public.thread_category add value if not exists 'personal_other';

create table public.mail_attachments (
  "id" uuid default gen_random_uuid() not null,
  "message_id" uuid not null,
  "filename" text not null,
  "mime_type" text,
  "file_size" bigint,
  "storage_bucket" text default 'email-attachments'::text not null,
  "storage_path" text not null,
  "created_at" timestamp with time zone default now() not null,
  PRIMARY KEY (id),
  UNIQUE (storage_bucket, storage_path)
);
create table public.mail_internal_domains (
  "domain" text not null,
  PRIMARY KEY (domain)
);
create table public.mail_settings (
  "key" text not null,
  "value" integer not null,
  PRIMARY KEY (key)
);
create table public.party_conflicts (
  "id" uuid default gen_random_uuid() not null,
  "party_id" uuid not null,
  "mailbox_ids" uuid[] not null,
  "resolved_owner_staff_id" uuid,
  "resolved_by" uuid,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone default now(),
  UNIQUE (party_id),
  PRIMARY KEY (id)
);
create table public.reminder_log (
  "id" bigserial,
  "thread_id" uuid,
  "kind" text,
  "owner_staff_id" uuid,
  "wa_message_id" text,
  "sent_at" timestamp with time zone default now(),
  PRIMARY KEY (id)
);
create table public.sender_profile (
  "email" text not null,
  "domain" text,
  "sender_type" text,
  "decided_by" text,
  "msg_count" integer,
  "inbound_count" integer,
  "outbound_count" integer,
  "first_seen" timestamp with time zone,
  "last_seen" timestamp with time zone,
  PRIMARY KEY (email)
);
create table public.thread_classification (
  "thread_id" uuid not null,
  "is_business" boolean,
  "outcome" text,
  "competitor" text,
  "competitor_rate" text,
  "materials" jsonb,
  "confidence" numeric,
  "evidence" text,
  "model" text,
  "prompt_version" text,
  "needs_review" boolean default false,
  "manual_override" boolean default false,
  "classified_at" timestamp with time zone default now(),
  "reason" text,
  "outcome_confidence" numeric,
  "outcome_model" text,
  "outcome_prompt_version" text,
  PRIMARY KEY (thread_id)
);

alter table public.mail_messages add column if not exists "body_text" text;
alter table public.mail_messages add column if not exists "body_html" text;
alter table public.mail_messages add column if not exists "message_headers" jsonb;
alter table public.mail_messages add column if not exists "processing_status" text default 'pending'::text not null;
alter table public.mail_messages add column if not exists "processing_error" text;
alter table public.mail_messages add column if not exists "processed_at" timestamp with time zone;
alter table public.mail_messages add column if not exists "attachments" jsonb default '[]'::jsonb not null;
alter table public.mail_messages add column if not exists "from_email" text generated always as (lower(COALESCE("substring"(from_address, '<([^>]+)>'::text), from_address))) stored;
alter table public.mail_threads add column if not exists "needs_reply" boolean default false not null;
alter table public.mail_threads add column if not exists "reply_due_at" timestamp with time zone;
alter table public.mail_threads add column if not exists "last_inbound_at" timestamp with time zone;
alter table public.mail_threads add column if not exists "last_outbound_at" timestamp with time zone;
alter table public.mail_threads add column if not exists "completed_at" timestamp with time zone;
alter table public.mail_threads add column if not exists "ignored_reason" text;
alter table public.mail_threads add column if not exists "archived_at" timestamp with time zone;
alter table public.mail_threads add column if not exists "classify_status" text default 'pending'::text;
alter table public.mail_threads add column if not exists "classify_claimed_at" timestamp with time zone;
alter table public.mail_threads add column if not exists "classify_error" text;
alter table public.mail_threads add column if not exists "outcome_status" text;
alter table public.mail_threads add column if not exists "outcome_claimed_at" timestamp with time zone;
alter table public.mail_threads add column if not exists "outcome_error" text;
alter table public.mail_threads add column if not exists "lead_status" text;
alter table public.mail_threads add column if not exists "lead_status_at" timestamp with time zone;
alter table public.parties add column if not exists "client_status" text;
alter table public.parties add column if not exists "last_order_at" timestamp with time zone;
alter table public.parties add column if not exists "owner_staff_id" uuid;
alter table public.parties add column if not exists "email_domain" text;
alter table public.parties add column if not exists "entity_id" uuid;
alter table public.parties add column if not exists "party_key" text;
alter table public.parties add column if not exists "enrich_status" text default 'pending'::text;
alter table public.party_contacts add column if not exists "contact_name" text;
alter table public.party_contacts add column if not exists "first_seen" timestamp with time zone;
alter table public.party_contacts add column if not exists "last_seen" timestamp with time zone;
alter table public.party_contacts add column if not exists "msg_count" integer default 0;

create or replace view public.party_owner_agg as
 WITH touch AS (
         SELECT t.party_id,
            mb.id AS mailbox_id,
            mb.owner_staff_id,
            count(*) AS threads
           FROM mail_threads t
             JOIN mailboxes mb ON mb.id = t.mailbox_id
          WHERE t.party_id IS NOT NULL AND mb.owner_staff_id IS NOT NULL
          GROUP BY t.party_id, mb.id, mb.owner_staff_id
        )
 SELECT party_id,
    count(DISTINCT owner_staff_id) AS owners,
    (array_agg(owner_staff_id ORDER BY threads DESC))[1] AS top_owner,
    array_agg(mailbox_id) AS mailbox_ids
   FROM touch
  GROUP BY party_id;
create or replace view public.party_summary as
 SELECT p.id AS party_id,
    p.entity_id,
    p.name,
    p.city,
    p.country,
    p.owner_staff_id,
    p.client_status,
    p.last_order_at,
    count(t.id) AS threads,
    count(t.id) FILTER (WHERE t.category = 'customer_inquiry'::thread_category) AS inquiries,
    count(t.id) FILTER (WHERE c.outcome = 'won'::text) AS won,
    count(t.id) FILTER (WHERE c.outcome = 'lost'::text) AS lost,
    count(t.id) FILTER (WHERE c.outcome = 'no_reply'::text) AS no_reply,
    min(t.first_message_at) AS first_contact,
    max(t.last_message_at) AS last_contact
   FROM parties p
     LEFT JOIN mail_threads t ON t.id IS NOT NULL AND t.party_id = p.id
     LEFT JOIN thread_classification c ON c.thread_id = t.id
  GROUP BY p.id;
create or replace view public.thread_counterpart as
 WITH free(domain) AS (
         VALUES ('gmail.com'::text), ('googlemail.com'::text), ('yahoo.com'::text), ('yahoo.in'::text), ('yahoo.co.in'::text), ('ymail.com'::text), ('outlook.com'::text), ('hotmail.com'::text), ('live.com'::text), ('rediffmail.com'::text), ('icloud.com'::text), ('aol.com'::text), ('proton.me'::text), ('protonmail.com'::text)
        ), cands AS (
         SELECT t.id AS thread_id,
            mb.entity_id,
            lower(m.from_email) AS email,
            m.sent_at,
            1 AS pri
           FROM mail_threads t
             JOIN mailboxes mb ON mb.id = t.mailbox_id
             JOIN mail_messages m ON m.thread_id = t.id AND m.direction = 'in'::mail_direction
          WHERE t.category = ANY (ARRAY['customer_inquiry'::thread_category, 'customer_order_ops'::thread_category])
        UNION ALL
         SELECT t.id,
            mb.entity_id,
            lower(a.a) AS lower,
            m.sent_at,
            2
           FROM mail_threads t
             JOIN mailboxes mb ON mb.id = t.mailbox_id
             JOIN mail_messages m ON m.thread_id = t.id AND m.direction = 'out'::mail_direction
             CROSS JOIN LATERAL unnest(m.to_addresses) a(a)
          WHERE t.category = ANY (ARRAY['customer_inquiry'::thread_category, 'customer_order_ops'::thread_category])
        ), ok AS (
         SELECT c.thread_id,
            c.entity_id,
            c.email,
            c.sent_at,
            c.pri
           FROM cands c
             LEFT JOIN sender_profile sp ON sp.email = c.email
          WHERE c.email ~~ '%@%'::text AND (COALESCE(sp.sender_type, 'unknown'::text) <> ALL (ARRAY['internal'::text, 'system'::text, 'marketing'::text, 'spam'::text]))
        ), ranked AS (
         SELECT DISTINCT ON (ok.thread_id) ok.thread_id,
            ok.entity_id,
            ok.email,
            split_part(ok.email, '@'::text, 2) AS domain
           FROM ok
          ORDER BY ok.thread_id, ok.pri, ok.sent_at
        )
 SELECT thread_id,
    entity_id,
    email,
    domain,
        CASE
            WHEN (domain IN ( SELECT free.domain
               FROM free)) THEN email
            ELSE domain
        END AS party_key
   FROM ranked r;

CREATE OR REPLACE FUNCTION app.mail_summary()
 RETURNS TABLE(mailbox_id uuid, address text, entity_id uuid, awaiting_reply bigint, follow_up bigint, threads bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.id, m.address, m.entity_id,
         count(t.id) filter (where t.status in ('new', 'needs_reply')),
         count(t.id) filter (where t.status = 'follow_up'),
         count(t.id)
    from public.mailboxes m
    left join public.mail_threads t on t.mailbox_id = m.id
   where app.is_internal()
   group by m.id
$function$
;

alter table public.mail_attachments enable row level security;
create policy mail_attachments_read on public.mail_attachments for select to authenticated using (app.is_internal());
grant select on public.mail_attachments to authenticated;
alter table public.mail_internal_domains enable row level security;
create policy mail_internal_domains_read on public.mail_internal_domains for select to authenticated using (app.is_internal());
grant select on public.mail_internal_domains to authenticated;
alter table public.mail_settings enable row level security;
create policy mail_settings_read on public.mail_settings for select to authenticated using (app.is_internal());
grant select on public.mail_settings to authenticated;
alter table public.party_conflicts enable row level security;
create policy party_conflicts_read on public.party_conflicts for select to authenticated using (app.is_internal());
grant select on public.party_conflicts to authenticated;
alter table public.reminder_log enable row level security;
create policy reminder_log_read on public.reminder_log for select to authenticated using (app.is_internal());
grant select on public.reminder_log to authenticated;
alter table public.sender_profile enable row level security;
create policy sender_profile_read on public.sender_profile for select to authenticated using (app.is_internal());
grant select on public.sender_profile to authenticated;
alter table public.thread_classification enable row level security;
create policy thread_classification_read on public.thread_classification for select to authenticated using (app.is_internal());
grant select on public.thread_classification to authenticated;
grant select on public.party_owner_agg, public.party_summary, public.thread_counterpart to authenticated;
