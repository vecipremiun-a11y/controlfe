// Database schema for Salon SaaS - Multi-tenant
// Run this via the /api/setup route or manually

export const SCHEMA_STATEMENTS = [
  // ============================================
  // SaaS Platform Tables
  // ============================================
  `CREATE TABLE IF NOT EXISTS saas_users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'admin' CHECK(role IN ('super_admin','admin','support','finance')),
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    max_branches INTEGER DEFAULT 1,
    max_users INTEGER DEFAULT 3,
    max_bookings_month INTEGER DEFAULT -1,
    whatsapp_auto INTEGER DEFAULT 0,
    advanced_reports INTEGER DEFAULT 0,
    campaigns INTEGER DEFAULT 0,
    price_monthly REAL DEFAULT 0,
    price_yearly REAL DEFAULT 0,
    features TEXT DEFAULT '{}',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  // ============================================
  // Tenant (Salon) Tables
  // ============================================
  `CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    logo_url TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    country TEXT DEFAULT 'DO',
    timezone TEXT DEFAULT 'America/Santo_Domingo',
    currency TEXT DEFAULT 'DOP',
    plan_id TEXT,
    status TEXT DEFAULT 'activo' CHECK(status IN ('activo','suspendido','trial','cancelado')),
    config TEXT DEFAULT '{}',
    onboarding_completed INTEGER DEFAULT 0,
    trial_ends_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (plan_id) REFERENCES plans(id)
  )`,

  `CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active','past_due','cancelled','trialing')),
    current_period_start TEXT,
    current_period_end TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (plan_id) REFERENCES plans(id)
  )`,

  `CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    is_main INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    config TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  )`,

  // ============================================
  // Users & Auth
  // ============================================
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'vendedor' CHECK(role IN ('owner','admin','supervisor','recepcionista','bodeguero','vendedor','receptionist','professional')),
    active INTEGER DEFAULT 1,
    last_login TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
  )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_tenant ON users(email, tenant_id)`,

  // ============================================
  // Services
  // ============================================
  `CREATE TABLE IF NOT EXISTS service_categories (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  )`,

  `CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    category_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    duration_min INTEGER NOT NULL DEFAULT 30,
    price REAL NOT NULL DEFAULT 0,
    buffer_min INTEGER DEFAULT 0,
    color TEXT DEFAULT '#6C5CE7',
    requires_deposit INTEGER DEFAULT 0,
    deposit_amount REAL DEFAULT 0,
    active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (category_id) REFERENCES service_categories(id)
  )`,

  `CREATE TABLE IF NOT EXISTS service_combos (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    services_json TEXT NOT NULL DEFAULT '[]',
    total_duration_min INTEGER NOT NULL DEFAULT 0,
    price REAL NOT NULL DEFAULT 0,
    discount_percent REAL DEFAULT 0,
    is_combo INTEGER DEFAULT 0,
    combo_items TEXT DEFAULT '[]',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  )`,

  // ============================================
  // Professionals & Schedules
  // ============================================
  `CREATE TABLE IF NOT EXISTS professionals (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT,
    user_id TEXT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    specialties TEXT DEFAULT '[]',
    avatar_url TEXT,
    color TEXT DEFAULT '#6C5CE7',
    is_available INTEGER DEFAULT 1,
    commission_percent REAL DEFAULT 50,
    pay_frequency TEXT DEFAULT 'daily',
    pay_day TEXT,
    running_balance REAL DEFAULT 0,
    active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,

  `CREATE TABLE IF NOT EXISTS professional_services (
    id TEXT PRIMARY KEY,
    professional_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    custom_price REAL,
    custom_duration_min INTEGER,
    FOREIGN KEY (professional_id) REFERENCES professionals(id),
    FOREIGN KEY (service_id) REFERENCES services(id)
  )`,

  // Control de arriendo de sillón: registro de pagos por día (abonos
  // parciales). El monto del arriendo se toma de la ficha del profesional
  // en Personal (payment_mode='rent', rent_amount, rent_frequency).
  `CREATE TABLE IF NOT EXISTS chair_rent_days (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    professional_id TEXT NOT NULL,
    date TEXT NOT NULL,
    amount_due REAL NOT NULL DEFAULT 0,
    amount_paid REAL NOT NULL DEFAULT 0,
    payment_method TEXT,
    notes TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(professional_id, date)
  )`,

  // Rent payments tracking for "arriendo" mode
  `CREATE TABLE IF NOT EXISTS professional_rent_payments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    professional_id TEXT NOT NULL,
    amount REAL NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    paid_at TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','overdue')),
    payment_method TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (professional_id) REFERENCES professionals(id)
  )`,

  `CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    professional_id TEXT NOT NULL,
    day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    break_start TEXT,
    break_end TEXT,
    active INTEGER DEFAULT 1,
    FOREIGN KEY (professional_id) REFERENCES professionals(id)
  )`,

  `CREATE TABLE IF NOT EXISTS schedule_exceptions (
    id TEXT PRIMARY KEY,
    professional_id TEXT NOT NULL,
    date TEXT NOT NULL,
    type TEXT DEFAULT 'blocked' CHECK(type IN ('blocked','custom')),
    start_time TEXT,
    end_time TEXT,
    reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (professional_id) REFERENCES professionals(id)
  )`,

  // ============================================
  // Clients
  // ============================================
  `CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    gender TEXT,
    birth_date TEXT,
    notes TEXT,
    preferences TEXT DEFAULT '{}',
    tags TEXT DEFAULT '[]',
    total_visits INTEGER DEFAULT 0,
    total_spent REAL DEFAULT 0,
    last_visit TEXT,
    no_show_count INTEGER DEFAULT 0,
    source TEXT DEFAULT 'manual',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  )`,

  // ============================================
  // Appointments
  // ============================================
  `CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT,
    client_id TEXT,
    professional_id TEXT NOT NULL,
    service_id TEXT,
    combo_id TEXT,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    status TEXT DEFAULT 'reservado' CHECK(status IN ('reservado','confirmado','en_atencion','terminado','no_show','cancelado')),
    client_name TEXT,
    client_phone TEXT,
    client_email TEXT,
    notes TEXT,
    cancel_reason TEXT,
    source TEXT DEFAULT 'manual' CHECK(source IN ('manual','online','whatsapp','phone','walk_in')),
    deposit_paid REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (professional_id) REFERENCES professionals(id),
    FOREIGN KEY (service_id) REFERENCES services(id)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(tenant_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_appointments_professional ON appointments(professional_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id)`,

  `CREATE TABLE IF NOT EXISTS waitlist (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    client_id TEXT,
    client_name TEXT NOT NULL,
    client_phone TEXT,
    service_id TEXT,
    professional_id TEXT,
    preferred_date TEXT,
    preferred_time TEXT,
    notes TEXT,
    status TEXT DEFAULT 'waiting' CHECK(status IN ('waiting','notified','booked','expired')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  )`,

  // ============================================
  // Products & Inventory
  // ============================================
  `CREATE TABLE IF NOT EXISTS product_categories (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  )`,

  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    category_id TEXT,
    sku TEXT,
    name TEXT NOT NULL,
    description TEXT,
    cost REAL DEFAULT 0,
    price REAL NOT NULL DEFAULT 0,
    stock INTEGER DEFAULT 0,
    min_stock INTEGER DEFAULT 5,
    unit TEXT DEFAULT 'unidad',
    image_url TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (category_id) REFERENCES product_categories(id)
  )`,

  `CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    contact_name TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  )`,

  `CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    supplier_id TEXT,
    invoice_number TEXT,
    date TEXT NOT NULL,
    total REAL DEFAULT 0,
    status TEXT DEFAULT 'received',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  )`,

  `CREATE TABLE IF NOT EXISTS purchase_items (
    id TEXT PRIMARY KEY,
    purchase_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    cost REAL NOT NULL,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`,

  `CREATE TABLE IF NOT EXISTS inventory_movements (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('sale','purchase','adjustment','return','loss')),
    quantity INTEGER NOT NULL,
    reference_id TEXT,
    reason TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`,

  // ============================================
  // Sales / POS
  // ============================================
  `CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT,
    client_id TEXT,
    user_id TEXT,
    register_id TEXT,
    appointment_id TEXT,
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    tip REAL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    payment_method TEXT DEFAULT 'cash' CHECK(payment_method IN ('cash','card','transfer','mixed')),
    payment_details TEXT DEFAULT '{}',
    status TEXT DEFAULT 'completed' CHECK(status IN ('completed','voided','refunded')),
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,

  `CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('service','product')),
    item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price REAL NOT NULL,
    discount REAL DEFAULT 0,
    total REAL NOT NULL,
    professional_id TEXT,
    FOREIGN KEY (sale_id) REFERENCES sales(id)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_sales_tenant_date ON sales(tenant_id, created_at)`,

  // ============================================
  // Cash Register
  // ============================================
  `CREATE TABLE IF NOT EXISTS cash_registers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT,
    opened_by TEXT NOT NULL,
    opened_at TEXT DEFAULT (datetime('now')),
    closed_by TEXT,
    closed_at TEXT,
    opening_amount REAL DEFAULT 0,
    expected_amount REAL DEFAULT 0,
    actual_amount REAL,
    difference REAL DEFAULT 0,
    status TEXT DEFAULT 'open' CHECK(status IN ('open','closed')),
    notes TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
  )`,

  `CREATE TABLE IF NOT EXISTS cash_movements (
    id TEXT PRIMARY KEY,
    register_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income','expense','withdrawal','deposit')),
    amount REAL NOT NULL,
    description TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (register_id) REFERENCES cash_registers(id)
  )`,

  // ============================================
  // Commissions
  // ============================================
  `CREATE TABLE IF NOT EXISTS commission_rules (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    professional_id TEXT,
    type TEXT NOT NULL CHECK(type IN ('service_percent','product_percent','service_fixed')),
    service_id TEXT,
    percentage REAL DEFAULT 0,
    fixed_amount REAL DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (professional_id) REFERENCES professionals(id),
    FOREIGN KEY (service_id) REFERENCES services(id)
  )`,

  // ============================================
  // WhatsApp & Marketing
  // ============================================
  `CREATE TABLE IF NOT EXISTS whatsapp_templates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('confirmation','reminder_24h','reminder_2h','thanks','reschedule','promo','custom')),
    content TEXT NOT NULL,
    variables TEXT DEFAULT '[]',
    is_global INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS whatsapp_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    client_id TEXT,
    appointment_id TEXT,
    template_id TEXT,
    phone TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'auto' CHECK(type IN ('auto','manual','campaign')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','sent','delivered','failed')),
    error TEXT,
    sent_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  )`,

  `CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    template_id TEXT,
    segment TEXT DEFAULT '{}',
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft','scheduled','sending','completed','cancelled')),
    scheduled_at TEXT,
    sent_count INTEGER DEFAULT 0,
    total_targets INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (template_id) REFERENCES whatsapp_templates(id)
  )`,

  // ============================================
  // Audit Logs
  // ============================================
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    user_id TEXT,
    user_name TEXT,
    action TEXT NOT NULL,
    entity TEXT,
    entity_id TEXT,
    details TEXT DEFAULT '{}',
    ip_address TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id, created_at)`,

  // ============================================
  // Professional Movements (earnings, advances, settlements)
  // ============================================
  `CREATE TABLE IF NOT EXISTS professional_movements (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    professional_id TEXT NOT NULL,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('earning','advance','settlement','adjustment')),
    amount REAL NOT NULL,
    balance_after REAL NOT NULL DEFAULT 0,
    reference_id TEXT,
    payment_method TEXT,
    notes TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (professional_id) REFERENCES professionals(id)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_prof_movements_date ON professional_movements(tenant_id, professional_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_prof_movements_type ON professional_movements(professional_id, type)`,

  // ============================================
  // Daily Closings & Payments
  // ============================================
  `CREATE TABLE IF NOT EXISTS daily_closings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    professional_id TEXT NOT NULL,
    date TEXT NOT NULL,
    total_services INTEGER DEFAULT 0,
    total_revenue REAL DEFAULT 0,
    revenue_by_method TEXT DEFAULT '{}',
    payment_model TEXT DEFAULT 'commission',
    amount_owed REAL DEFAULT 0,
    amount_paid REAL DEFAULT 0,
    payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending','partial','paid','waived')),
    notes TEXT,
    closed_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (professional_id) REFERENCES professionals(id),
    UNIQUE(tenant_id, professional_id, date)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_daily_closings_date ON daily_closings(tenant_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_daily_closings_prof ON daily_closings(professional_id, date)`,

  `CREATE TABLE IF NOT EXISTS daily_closing_payments (
    id TEXT PRIMARY KEY,
    closing_id TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT DEFAULT 'cash',
    notes TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (closing_id) REFERENCES daily_closings(id)
  )`,

  // ============================================
  // Time Entries (for hourly payment model)
  // ============================================
  `CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    professional_id TEXT NOT NULL,
    date TEXT NOT NULL,
    clock_in TEXT NOT NULL,
    clock_out TEXT,
    total_hours REAL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (professional_id) REFERENCES professionals(id)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(tenant_id, professional_id, date)`,
];
