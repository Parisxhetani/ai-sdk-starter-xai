# Friday Tony's Orders

A team lunch ordering system for Tony's restaurant in Tirana, Albania. Built for a team of 10 with time-based ordering windows, admin controls, and SMS integration.

## Features

- **Authentication**: Email/password with whitelist-based access control
- **Time-based Ordering**: Friday 09:00-12:30 (Europe/Tirane timezone) ordering window
- **Menu Management**: Admin-controlled menu items with variants
- **Order Management**: One order per user per Friday, editable until locked
- **Admin Dashboard**: Lock orders, export CSV, manage menu, audit logs
- **SMS Integration**: Send aggregated orders to Tony's restaurant via Twilio
- **Real-time Updates**: Live team order summary and status

## Tech Stack

- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes, Supabase (PostgreSQL)
- **Authentication**: Supabase Auth with Row Level Security
- **SMS**: Twilio API integration
- **Deployment**: Vercel

## Environment Variables

Required environment variables:

\`\`\`env
# Supabase (automatically configured in v0)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Twilio SMS (optional - will use mock SMS if not provided)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number

# Development redirect URL
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL=http://localhost:3000
\`\`\`

## Setup Instructions

1. **Database Setup**: Run the SQL scripts in the `scripts/` folder:
   - `001_create_tables.sql` - Creates all required tables with RLS policies
   - `002_seed_data.sql` - Seeds menu items and default settings
   - `003_user_profile_trigger.sql` - Sets up user registration trigger

2. **Whitelist Configuration**: Update the whitelisted emails in the settings table or modify `002_seed_data.sql` before running.

3. **SMS Configuration**: 
   - Add Twilio credentials to environment variables for production SMS
   - Without Twilio, the system will use mock SMS (logs to console)

4. **Admin Setup**: The first user with email `admin@company.com` will automatically get admin role.

## Usage

### For Team Members
1. Register with a whitelisted email address
2. Confirm email and sign in
3. Place orders during Friday 09:00-12:30 window
4. View team order summary in real-time

### For Admins
1. Sign in with admin account
2. Monitor team orders and missing users
3. Lock orders when ready to send to restaurant
4. Export CSV for record keeping
5. Send SMS to Tony's restaurant with order summary
6. Manage menu items (enable/disable variants)
7. View audit logs of all system activity

## Order Window Logic

- **Open**: Fridays 09:00-12:30 (Europe/Tirane timezone)
- **Closed**: All other times with countdown to next window
- **Locked**: Admin can lock orders to prevent further changes
- **One Order Rule**: Each user can have only one order per Friday

## SMS Format

When sent to Tony's restaurant:
\`\`\`
Friday order – Tony's (Tirana): 8 meals. Enchilada: Chicken x2, Beef x1. Burgers: Philly x3, Jalapeño x2. Contact: +355691234567.
\`\`\`

## Security Features

- Row Level Security (RLS) on all database tables
- Whitelist-based access control
- Admin-only functions protected by role checks
- Audit logging for all critical actions
- Rate limiting and input validation
- CSRF protection on all forms

## Database Schema

- **users**: User profiles with roles and whitelist status
- **menu_items**: Restaurant menu with admin-controlled availability
- **orders**: User orders linked to specific Fridays
- **events**: Audit log of all system actions
- **settings**: Configurable system settings (phone numbers, etc.)

## Development

The app is built with Next.js and can be run locally:

\`\`\`bash
npm install
npm run dev
\`\`\`

Database migrations are handled through the SQL scripts in the `scripts/` folder.
