require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const { authenticateToken, requireAdmin, requireUser } = require("./middleware/auth");
const { z } = require("zod");

// =======================
// INIT EXPRESS
// =======================
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || "0.0.0.0";

// =======================
// SUPABASE CLIENT
// =======================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// =======================
// HEALTH CHECK
// =======================
app.get("/health", async (req, res) => {
  res.json({
    status: "ok",
    message: "Voucher Service is running",
    timestamp: new Date().toISOString(),
  });
});

// =======================
// AUTH ENDPOINTS
// =======================

// Login - generate JWT token
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Email dan password harus diisi",
      });
    }

    // Login dengan Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Email atau password salah",
        detail: error.message,
      });
    }

    // Ambil profile user untuk cek role
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();

    if (profileError) {
      console.error("Error fetching profile:", profileError);
    }

    res.json({
      success: true,
      message: "Login berhasil",
      data: {
        user: {
          id: data.user.id,
          email: data.user.email,
          role: profile?.role || "USER",
          full_name: profile?.full_name,
        },
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
        },
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Terjadi kesalahan saat login",
    });
  }
});

// Register - buat user baru (opsional, untuk testing)
app.post("/auth/register", async (req, res) => {
  try {
    const { email, password, full_name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Email dan password harus diisi",
      });
    }

    // Register dengan Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: full_name || "User",
        },
      },
    });

    if (error) {
      return res.status(400).json({
        error: "Registration Failed",
        message: error.message,
      });
    }

    res.json({
      success: true,
      message: "Registrasi berhasil. Silakan cek email untuk konfirmasi.",
      data: {
        user: {
          id: data.user.id,
          email: data.user.email,
        },
      },
    });
  } catch (err) {
    console.error("❌ Register error:", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Terjadi kesalahan saat registrasi",
    });
  }
});

// =======================
// VOUCHER ENDPOINTS
// =======================

// Validation schemas
const createVoucherSchema = z.object({
  code: z.string().min(3).max(50),
  name: z.string().min(3).max(255),
  description: z.string().optional(),
  discount_type: z.enum(["PERCENT", "FIXED"]),
  discount_value: z.number().int().positive(),
  currency: z.string().default("IDR"),
  min_order_amount: z.number().int().min(0).default(0),
  max_discount_amount: z.number().int().min(0).optional(),
  max_total_redemptions: z.number().int().positive().default(1),
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime().optional(),
});

const redeemVoucherSchema = z.object({
  order_amount: z.number().int().positive(),
  order_id: z.string().optional(),
});

// GET /vouchers - List semua vouchers
app.get("/vouchers", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("vouchers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Supabase error:", error);
      return res.status(500).json({ 
        error: error.message,
        hint: "Check if table 'vouchers' exists in Supabase"
      });
    }

    res.json({
      success: true,
      count: data.length,
      data: data,
    });
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /vouchers - Create voucher (ADMIN only)
app.post("/vouchers", authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Validate request body
    const validation = createVoucherSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Data voucher tidak valid",
        details: validation.error.errors,
      });
    }

    const voucherData = validation.data;

    // Validate discount_value untuk PERCENT type
    if (voucherData.discount_type === "PERCENT" && voucherData.discount_value > 100) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Discount value untuk tipe PERCENT tidak boleh lebih dari 100",
      });
    }

    // Validate start_at dan end_at
    if (voucherData.start_at && voucherData.end_at) {
      if (new Date(voucherData.end_at) < new Date(voucherData.start_at)) {
        return res.status(400).json({
          error: "Validation Error",
          message: "end_at harus lebih besar atau sama dengan start_at",
        });
      }
    }

    // Check if code already exists
    const { data: existing } = await supabase
      .from("vouchers")
      .select("code")
      .eq("code", voucherData.code)
      .single();

    if (existing) {
      return res.status(409).json({
        error: "Conflict",
        message: `Voucher dengan code '${voucherData.code}' sudah ada`,
      });
    }

    // Insert voucher baru
    const { data, error } = await supabase
      .from("vouchers")
      .insert([{
        ...voucherData,
        total_redeemed: 0,
        is_active: true,
        created_by: req.user.id,
      }])
      .select()
      .single();

    if (error) {
      console.error("❌ Error creating voucher:", error);
      return res.status(500).json({
        error: "Database Error",
        message: "Gagal membuat voucher",
        detail: error.message,
      });
    }

    res.status(201).json({
      success: true,
      message: "Voucher berhasil dibuat",
      data: data,
    });
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ 
      error: "Internal Server Error",
      message: "Terjadi kesalahan saat membuat voucher" 
    });
  }
});

// GET /vouchers/:code - Get voucher detail by code
app.get("/vouchers/:code", async (req, res) => {
  try {
    const { code } = req.params;

    const { data, error } = await supabase
      .from("vouchers")
      .select("*")
      .eq("code", code)
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: "Not Found",
        message: `Voucher dengan code '${code}' tidak ditemukan`,
      });
    }

    // Check if voucher masih valid
    const now = new Date();
    const startAt = data.start_at ? new Date(data.start_at) : null;
    const endAt = data.end_at ? new Date(data.end_at) : null;
    
    const isNotStarted = startAt && now < startAt;
    const isExpired = endAt && now > endAt;
    const isAvailable = data.is_active && !isNotStarted && !isExpired && data.total_redeemed < data.max_total_redemptions;

    res.json({
      success: true,
      data: {
        ...data,
        is_not_started: isNotStarted,
        is_expired: isExpired,
        is_available: isAvailable,
        remaining_redemptions: data.max_total_redemptions - data.total_redeemed,
      },
    });
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /vouchers/:code/redeem - Redeem voucher (USER only)
app.post("/vouchers/:code/redeem", authenticateToken, requireUser, async (req, res) => {
  try {
    const { code } = req.params;
    const userId = req.user.id;

    // Validate request body
    const validation = redeemVoucherSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Data redeem tidak valid",
        details: validation.error.errors,
      });
    }

    const { order_amount, order_id } = validation.data;

    // Get voucher
    const { data: voucher, error: voucherError } = await supabase
      .from("vouchers")
      .select("*")
      .eq("code", code)
      .single();

    if (voucherError || !voucher) {
      return res.status(404).json({
        error: "Not Found",
        message: `Voucher dengan code '${code}' tidak ditemukan`,
      });
    }

    // Validasi voucher
    const now = new Date();
    const startAt = voucher.start_at ? new Date(voucher.start_at) : null;
    const endAt = voucher.end_at ? new Date(voucher.end_at) : null;

    if (!voucher.is_active) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Voucher sudah tidak aktif",
      });
    }

    if (startAt && now < startAt) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Voucher belum bisa digunakan",
        start_at: voucher.start_at,
      });
    }

    if (endAt && now > endAt) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Voucher sudah expired",
        expired_at: voucher.end_at,
      });
    }

    if (voucher.total_redeemed >= voucher.max_total_redemptions) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Voucher sudah habis digunakan",
      });
    }

    // Check min order amount
    if (order_amount < voucher.min_order_amount) {
      return res.status(400).json({
        error: "Bad Request",
        message: `Minimum order amount adalah ${voucher.currency} ${voucher.min_order_amount}`,
      });
    }

    // Check apakah user sudah pernah redeem voucher ini
    const { data: existingRedeem } = await supabase
      .from("voucher_redemptions")
      .select("*")
      .eq("voucher_id", voucher.id)
      .eq("user_id", userId)
      .single();

    if (existingRedeem) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Kamu sudah pernah menggunakan voucher ini",
        redeemed_at: existingRedeem.redeemed_at,
      });
    }

    // Hitung discount amount
    let discount_amount = 0;
    if (voucher.discount_type === "PERCENT") {
      discount_amount = Math.floor((order_amount * voucher.discount_value) / 100);
      
      // Apply max discount amount if exists
      if (voucher.max_discount_amount && discount_amount > voucher.max_discount_amount) {
        discount_amount = voucher.max_discount_amount;
      }
    } else {
      // FIXED discount
      discount_amount = voucher.discount_value;
      
      // Discount tidak boleh lebih besar dari order amount
      if (discount_amount > order_amount) {
        discount_amount = order_amount;
      }
    }

    const final_amount = order_amount - discount_amount;

    // Atomic transaction: Update voucher + Insert redemption
    const newTotalRedeemed = voucher.total_redeemed + 1;

    // Update voucher total_redeemed
    const { error: updateError } = await supabase
      .from("vouchers")
      .update({ total_redeemed: newTotalRedeemed })
      .eq("id", voucher.id)
      .eq("total_redeemed", voucher.total_redeemed); // Optimistic locking

    if (updateError) {
      console.error("❌ Error updating voucher:", updateError);
      return res.status(500).json({
        error: "Database Error",
        message: "Gagal memproses redeem, silakan coba lagi",
      });
    }

    // Insert redemption record
    const { data: redemption, error: redemptionError } = await supabase
      .from("voucher_redemptions")
      .insert([{
        voucher_id: voucher.id,
        user_id: userId,
        order_id: order_id || null,
        order_amount: order_amount,
        discount_amount: discount_amount,
        final_amount: final_amount,
        status: "SUCCESS",
      }])
      .select()
      .single();

    if (redemptionError) {
      console.error("❌ Error creating redemption:", redemptionError);
      
      // Rollback: kurangi total_redeemed kembali
      await supabase
        .from("vouchers")
        .update({ total_redeemed: voucher.total_redeemed })
        .eq("id", voucher.id);

      return res.status(500).json({
        error: "Database Error",
        message: "Gagal menyimpan redemption",
      });
    }

    res.json({
      success: true,
      message: "Voucher berhasil digunakan!",
      data: {
        voucher_code: voucher.code,
        voucher_name: voucher.name,
        discount_type: voucher.discount_type,
        discount_value: voucher.discount_value,
        order_amount: order_amount,
        discount_amount: discount_amount,
        final_amount: final_amount,
        currency: voucher.currency,
        redeemed_at: redemption.redeemed_at,
      },
    });
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ 
      error: "Internal Server Error",
      message: "Terjadi kesalahan saat redeem voucher" 
    });
  }
});

// PUT /vouchers/:id - Update voucher (ADMIN only)
app.put("/vouchers/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate request body (partial update)
    const updateSchema = z.object({
      name: z.string().min(3).max(255).optional(),
      description: z.string().optional(),
      discount_type: z.enum(["PERCENT", "FIXED"]).optional(),
      discount_value: z.number().int().positive().optional(),
      currency: z.string().optional(),
      min_order_amount: z.number().int().min(0).optional(),
      max_discount_amount: z.number().int().min(0).optional(),
      max_total_redemptions: z.number().int().positive().optional(),
      start_at: z.string().datetime().optional(),
      end_at: z.string().datetime().optional(),
      is_active: z.boolean().optional(),
    });

    const validation = updateSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Data update tidak valid",
        details: validation.error.errors,
      });
    }

    const updateData = validation.data;

    // Check if voucher exists
    const { data: existing, error: existError } = await supabase
      .from("vouchers")
      .select("*")
      .eq("id", id)
      .single();

    if (existError || !existing) {
      return res.status(404).json({
        error: "Not Found",
        message: `Voucher dengan ID '${id}' tidak ditemukan`,
      });
    }

    // Validate discount_value untuk PERCENT type
    const discountType = updateData.discount_type || existing.discount_type;
    const discountValue = updateData.discount_value || existing.discount_value;
    
    if (discountType === "PERCENT" && discountValue > 100) {
      return res.status(400).json({
        error: "Validation Error",
        message: "Discount value untuk tipe PERCENT tidak boleh lebih dari 100",
      });
    }

    // Validate start_at dan end_at
    const startAt = updateData.start_at || existing.start_at;
    const endAt = updateData.end_at || existing.end_at;
    
    if (startAt && endAt && new Date(endAt) < new Date(startAt)) {
      return res.status(400).json({
        error: "Validation Error",
        message: "end_at harus lebih besar atau sama dengan start_at",
      });
    }

    // Update voucher
    const { data, error } = await supabase
      .from("vouchers")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("❌ Error updating voucher:", error);
      return res.status(500).json({
        error: "Database Error",
        message: "Gagal update voucher",
        detail: error.message,
      });
    }

    res.json({
      success: true,
      message: "Voucher berhasil diupdate",
      data: data,
    });
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ 
      error: "Internal Server Error",
      message: "Terjadi kesalahan saat update voucher" 
    });
  }
});

// DELETE /vouchers/:id - Delete voucher (ADMIN only)
app.delete("/vouchers/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if voucher exists
    const { data: existing, error: existError } = await supabase
      .from("vouchers")
      .select("code, total_redeemed")
      .eq("id", id)
      .single();

    if (existError || !existing) {
      return res.status(404).json({
        error: "Not Found",
        message: `Voucher dengan ID '${id}' tidak ditemukan`,
      });
    }

    // Prevent delete if voucher sudah pernah digunakan
    if (existing.total_redeemed > 0) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Tidak bisa delete voucher yang sudah pernah digunakan",
        total_redeemed: existing.total_redeemed,
      });
    }

    // Delete voucher
    const { error } = await supabase
      .from("vouchers")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("❌ Error deleting voucher:", error);
      return res.status(500).json({
        error: "Database Error",
        message: "Gagal delete voucher",
        detail: error.message,
      });
    }

    res.json({
      success: true,
      message: `Voucher '${existing.code}' berhasil dihapus`,
    });
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ 
      error: "Internal Server Error",
      message: "Terjadi kesalahan saat delete voucher" 
    });
  }
});

// =======================
// PROTECTED ENDPOINTS - TEST MIDDLEWARE
// =======================

// Endpoint untuk test authentication (semua role bisa akses)
app.get("/protected", authenticateToken, (req, res) => {
  res.json({
    message: "Ini endpoint protected, hanya bisa diakses dengan token valid",
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

// Endpoint khusus ADMIN
app.get("/admin-only", authenticateToken, requireAdmin, (req, res) => {
  res.json({
    message: "Selamat datang ADMIN!",
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

// Endpoint khusus USER
app.get("/user-only", authenticateToken, requireUser, (req, res) => {
  res.json({
    message: "Ini endpoint khusus USER biasa",
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

// =======================
// START SERVER
// =======================
app.listen(PORT, HOST, () => {
  console.log(`🚀 Voucher Service running on http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🗄️  Supabase URL: ${process.env.SUPABASE_URL ? "✅ Connected" : "❌ Not configured"}`);
});
