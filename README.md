# Voucher Service - Microservice Documentation

## 📋 Deskripsi Sistem

Voucher Service adalah microservice untuk manajemen voucher diskon dengan fitur:
- **Authentication & Authorization** menggunakan JWT dari Supabase
- **Role-based Access Control** (ADMIN dan USER)
- **CRUD Operations** untuk voucher
- **Redeem System** dengan atomic transactions
- **Validasi** menggunakan Zod
- **Isolated Deployment** menggunakan Docker

---

## 🏗️ Arsitektur Sistem

```
┌─────────────┐         ┌─────────────────┐         ┌─────────────┐
│   Client    │ ──────> │ Voucher Service │ ──────> │  Supabase   │
│ (Postman/   │  HTTPS  │   (Express.js)  │  API    │  (Database) │
│  Frontend)  │         │   Port: 8080    │         │             │
└─────────────┘         └─────────────────┘         └─────────────┘
                               │
                               │ Docker Container
                               │
                        ┌──────▼──────┐
                        │     STB     │
                        │  (aaPanel)  │
                        └─────────────┘
```

---

## 🔐 Authentication & Authorization

### **Flow Authentication:**
1. User login dengan email & password → POST /auth/login
2. Server validasi credentials via Supabase Auth
3. Server return JWT access_token
4. Client kirim token di header: `Authorization: Bearer <token>`
5. Middleware verify token & cek role di database

### **Role Types:**
- **ADMIN**: Bisa create, update, delete voucher
- **USER**: Hanya bisa redeem voucher

---

## 🛠️ Tech Stack

- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (JWT)
- **Validation**: Zod
- **Containerization**: Docker & Docker Compose

---

## 📦 Struktur Project

```
voucher-service/
├── src/
│   ├── middleware/
│   │   └── auth.js          # Authentication & authorization middleware
│   └── server.js             # Main application file
├── .env                      # Environment variables (not in git)
├── .dockerignore            # Docker ignore file
├── .gitignore               # Git ignore file
├── Dockerfile               # Docker image configuration
├── docker-compose.yml       # Docker Compose configuration
├── package.json             # Dependencies
└── README.md                # This file
```

---

## 🚀 Cara Menjalankan (Development)

### **1. Prerequisites**
```bash
- Node.js 20+
- npm atau yarn
- Supabase account
```

### **2. Install Dependencies**
```bash
npm install
```

### **3. Setup Environment Variables**
Buat file `.env` di root project:
```env
PORT=8080
HOST=0.0.0.0
JWT_SECRET=your_jwt_secret_here

# Supabase Configuration
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### **4. Run Development Server**
```bash
npm run dev
```

Server akan jalan di `http://localhost:8080`

---

## 🐳 Deployment dengan Docker

### **1. Build Docker Image**
```bash
docker build -t voucher-service .
```

### **2. Run dengan Docker Compose**
```bash
docker-compose up -d
```

### **3. Check Container Status**
```bash
docker-compose ps
docker-compose logs -f
```

### **4. Stop Container**
```bash
docker-compose down
```

---

## 📡 Deploy ke STB (Set Top Box) via aaPanel

### **Prerequisites di STB:**
- Docker & Docker Compose installed
- Git installed
- aaPanel installed (optional, untuk management)

### **Step-by-Step Deployment:**

**1. SSH ke STB**
```bash
ssh user@stb-ip-address
```

**2. Clone Repository**
```bash
git clone https://github.com/your-username/voucher-service.git
cd voucher-service/Platoo-voucher-service
```

**3. Setup Environment Variables**
```bash
nano .env
# Isi dengan credentials Supabase
```

**4. Build & Run dengan Docker Compose**
```bash
docker-compose up -d
```

**5. Verify Deployment**
```bash
docker-compose ps
curl http://localhost:8080/health
```

**6. Setup Nginx Reverse Proxy (aaPanel)**
- Buka aaPanel → Website → Add Site
- Domain: your-domain.com atau IP STB
- Reverse Proxy to: http://localhost:8080

---

## 🔌 API Endpoints

### **Base URL**
```
http://your-stb-domain:8080
atau
https://your-tunneling-url.com (jika pakai tunneling)
```

### **1. Health Check**
```http
GET /health
```
**Response:**
```json
{
  "status": "ok",
  "message": "Voucher Service is running",
  "timestamp": "2026-01-03T..."
}
```

---

### **2. Authentication**

#### **Login**
```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@voucher.test",
  "password": "your_password"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login berhasil",
  "data": {
    "user": {
      "id": "uuid",
      "email": "admin@voucher.test",
      "role": "ADMIN"
    },
    "session": {
      "access_token": "eyJhbGc...",
      "refresh_token": "...",
      "expires_at": 1735997385
    }
  }
}
```

#### **Register**
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "full_name": "John Doe"
}
```

---

### **3. Voucher Management (ADMIN Only)**

#### **Create Voucher**
```http
POST /vouchers
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "code": "NEWYEAR2026",
  "name": "New Year Discount",
  "description": "Special discount for new year",
  "discount_type": "PERCENT",
  "discount_value": 30,
  "currency": "IDR",
  "min_order_amount": 50000,
  "max_discount_amount": 30000,
  "max_total_redemptions": 50,
  "start_at": "2026-01-01T00:00:00Z",
  "end_at": "2026-01-31T23:59:59Z"
}
```

#### **Update Voucher**
```http
PUT /vouchers/:id
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "name": "Updated Name",
  "discount_value": 40,
  "is_active": true
}
```

#### **Delete Voucher**
```http
DELETE /vouchers/:id
Authorization: Bearer <admin_token>
```

---

### **4. Voucher Public Access**

#### **List All Vouchers**
```http
GET /vouchers
```

#### **Get Voucher Detail**
```http
GET /vouchers/:code
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "code": "NEWYEAR2026",
    "name": "New Year Discount",
    "discount_type": "PERCENT",
    "discount_value": 30,
    "is_available": true,
    "remaining_redemptions": 45,
    ...
  }
}
```

---

### **5. Redeem Voucher (USER Only)**

```http
POST /vouchers/:code/redeem
Authorization: Bearer <user_token>
Content-Type: application/json

{
  "order_amount": 150000,
  "order_id": "ORD-001"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Voucher berhasil digunakan!",
  "data": {
    "voucher_code": "NEWYEAR2026",
    "discount_type": "PERCENT",
    "discount_value": 30,
    "order_amount": 150000,
    "discount_amount": 30000,
    "final_amount": 120000,
    "currency": "IDR"
  }
}
```

---

## 🔒 Security Features

1. **JWT Authentication** - Semua protected endpoints require valid JWT token
2. **Role-based Authorization** - ADMIN dan USER punya akses berbeda
3. **Row Level Security (RLS)** - Database level security via Supabase
4. **Input Validation** - Semua input divalidasi menggunakan Zod
5. **Environment Variables** - Credentials disimpan di .env (tidak di-commit)
6. **Docker Isolation** - Service jalan di isolated container

---

## 📊 Database Schema

### **Table: profiles**
```sql
- id (uuid, PK, FK to auth.users)
- role (text: 'ADMIN' | 'USER')
- full_name (text)
- created_at (timestamp)
- updated_at (timestamp)
```

### **Table: vouchers**
```sql
- id (uuid, PK)
- code (citext, unique)
- name (text)
- description (text)
- discount_type (text: 'PERCENT' | 'FIXED')
- discount_value (integer)
- currency (text, default: 'IDR')
- min_order_amount (integer)
- max_discount_amount (integer, nullable)
- max_total_redemptions (integer)
- total_redeemed (integer, default: 0)
- start_at (timestamp, nullable)
- end_at (timestamp, nullable)
- is_active (boolean, default: true)
- created_by (uuid, FK to profiles)
- created_at (timestamp)
- updated_at (timestamp)
```

### **Table: voucher_redemptions**
```sql
- id (uuid, PK)
- voucher_id (uuid, FK to vouchers)
- user_id (uuid, FK to profiles)
- order_id (text, nullable)
- order_amount (integer)
- discount_amount (integer)
- final_amount (integer)
- redeemed_at (timestamp)
- status (text: 'SUCCESS' | 'CANCELLED' | 'REFUNDED')
```

---

## 🧪 Testing

### **Test dengan Postman:**

1. Import collection (atau buat manual)
2. Setup environment variables:
   - `base_url`: http://your-stb-domain:8080
   - `admin_token`: (dari login ADMIN)
   - `user_token`: (dari login USER)

### **Test Cases:**

**✅ Authentication:**
- [x] Login ADMIN berhasil
- [x] Login USER berhasil
- [x] Login dengan credentials salah (401)

**✅ Authorization:**
- [x] ADMIN bisa create voucher
- [x] USER tidak bisa create voucher (403)
- [x] USER bisa redeem voucher
- [x] ADMIN tidak bisa redeem voucher (403)

**✅ CRUD Voucher:**
- [x] Create voucher (ADMIN)
- [x] Read all vouchers (Public)
- [x] Read single voucher (Public)
- [x] Update voucher (ADMIN)
- [x] Delete voucher unused (ADMIN)
- [x] Delete voucher used gagal (ADMIN)

**✅ Redeem Voucher:**
- [x] Redeem voucher valid
- [x] Redeem voucher expired (400)
- [x] Redeem voucher habis (400)
- [x] Redeem voucher duplicate (400)
- [x] Redeem dengan min order tidak terpenuhi (400)

---

## 🐛 Troubleshooting

### **Container tidak start:**
```bash
docker-compose logs -f
# Check error logs
```

### **Cannot connect to database:**
- Pastikan SUPABASE_URL dan SUPABASE_ANON_KEY benar
- Check internet connection dari STB

### **Port 8080 already in use:**
```bash
# Check process
sudo lsof -i :8080

# Kill process atau ganti port di .env
```

### **Permission denied (Docker):**
```bash
sudo usermod -aG docker $USER
# Logout dan login lagi
```

---

## 📝 Environment Variables Reference

```env
# Server Configuration
PORT=8080                          # Port aplikasi
HOST=0.0.0.0                      # Host binding (0.0.0.0 untuk public access)
NODE_ENV=production               # Environment mode

# Security
JWT_SECRET=your_secret_here       # JWT signing secret (minimal 32 karakter)

# Supabase
SUPABASE_URL=https://xxx.supabase.co     # Supabase project URL
SUPABASE_ANON_KEY=eyJhbGc...              # Supabase anon/public key
```

---

## 👨‍💻 Developer

**Nama**: [Your Name]  
**NIM**: [Your NIM]  
**Mata Kuliah**: Teknologi Sistem Terintegrasi  
**Tugas**: UAS - Microservice Development

---

## 📄 License

This project is for educational purposes.

---

## 📞 Support

Jika ada pertanyaan atau issue:
1. Check troubleshooting section
2. Review API documentation
3. Check Docker logs: `docker-compose logs -f`
4. Contact: [your-email@example.com]

---

**Last Updated**: January 3, 2026
