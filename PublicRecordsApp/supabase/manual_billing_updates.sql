-- Manual billing updates for the pre-Stripe phase.
-- Run these in the Supabase SQL Editor as needed.
--
-- Replace YOUR_USER_ID with the profile/auth user id.

-- View the current billing state for one account.
select
  id,
  email,
  subscription_tier,
  account_status,
  document_limit,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_price_id,
  subscription_current_period_end
from public.profiles
where id = 'YOUR_USER_ID';

-- Move an account to Free.
update public.profiles
set
  subscription_tier = 'free',
  account_status = 'active',
  document_limit = 25,
  stripe_price_id = null,
  stripe_subscription_id = null,
  subscription_current_period_end = null
where id = 'YOUR_USER_ID';

-- Move an account to Starter.
update public.profiles
set
  subscription_tier = 'starter',
  account_status = 'active',
  document_limit = 250
where id = 'YOUR_USER_ID';

-- Move an account to Organization.
update public.profiles
set
  subscription_tier = 'organization',
  account_status = 'active',
  document_limit = 2500
where id = 'YOUR_USER_ID';

-- Mark a subscription as trialing.
update public.profiles
set
  account_status = 'trialing'
where id = 'YOUR_USER_ID';

-- Mark a subscription as past due.
update public.profiles
set
  account_status = 'past_due'
where id = 'YOUR_USER_ID';

-- Mark a subscription as canceled.
update public.profiles
set
  account_status = 'canceled'
where id = 'YOUR_USER_ID';

-- Attach Stripe ids later without changing the rest of the account model.
update public.profiles
set
  stripe_customer_id = 'cus_example',
  stripe_subscription_id = 'sub_example',
  stripe_price_id = 'price_example',
  subscription_current_period_end = now() + interval '30 days'
where id = 'YOUR_USER_ID';
