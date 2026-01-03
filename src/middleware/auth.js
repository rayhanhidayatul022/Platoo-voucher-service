const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Middleware untuk verify JWT token dari Supabase
 * Token harus dikirim via header: Authorization: Bearer <token>
 */
async function authenticateToken(req, res, next) {
  try {
    // Extract token dari Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Token tidak ditemukan. Format: Authorization: Bearer <token>",
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify token dengan Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Token tidak valid atau sudah expired",
      });
    }

    // Ambil data user dari tabel profiles untuk cek role
    const { data: userData, error: userError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (userError) {
      console.error("Error fetching user profile:", userError);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Gagal mengambil data user",
      });
    }

    // Attach user info ke request object
    req.user = {
      id: user.id,
      email: user.email,
      role: userData?.role || "USER", // Default role USER
      ...userData,
    };

    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Terjadi kesalahan saat verifikasi token",
    });
  }
}

/**
 * Middleware untuk check apakah user adalah ADMIN
 * HARUS dipanggil SETELAH authenticateToken
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "User belum terautentikasi",
    });
  }

  if (req.user.role !== "ADMIN") {
    return res.status(403).json({
      error: "Forbidden",
      message: "Akses ditolak. Hanya ADMIN yang bisa mengakses endpoint ini",
    });
  }

  next();
}

/**
 * Middleware untuk check apakah user adalah USER (bukan ADMIN)
 * HARUS dipanggil SETELAH authenticateToken
 */
function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "User belum terautentikasi",
    });
  }

  if (req.user.role !== "USER") {
    return res.status(403).json({
      error: "Forbidden",
      message: "Endpoint ini hanya untuk USER biasa",
    });
  }

  next();
}

module.exports = {
  authenticateToken,
  requireAdmin,
  requireUser,
};
