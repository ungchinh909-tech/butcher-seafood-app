import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import crypto from "crypto";
import { 
  getButchers, 
  saveButcher, 
  updateButcherStatus, 
  updateButcherPin, 
  deleteButcher, 
  getAdmins, 
  addAdmin, 
  removeAdmin, 
  getGoogleConfig, 
  saveGoogleConfig, 
  saveReport, 
  getReports 
} from "./serverDb";

dotenv.config();

const SERVER_SECRET = process.env.ADMIN_JWT_SECRET || "ButcherScaleSuperSecretKey2026_And_Beyond";

export function generateAdminToken(email: string): string {
  const expiresAt = Date.now() + 86400000 * 30; // 30 days
  const signature = crypto.createHmac("sha256", SERVER_SECRET).update(`${email}:${expiresAt}`).digest("hex");
  return `${Buffer.from(email).toString("base64")}.${expiresAt}.${signature}`;
}

export function verifyAdminTokenLocal(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [b64Email, expiresAtStr, signature] = parts;
    const email = Buffer.from(b64Email, "base64").toString("utf8");
    const expiresAt = parseInt(expiresAtStr, 10);
    
    if (isNaN(expiresAt) || expiresAt < Date.now()) {
      return null;
    }
    
    const expectedSignature = crypto.createHmac("sha256", SERVER_SECRET).update(`${email}:${expiresAt}`).digest("hex");
    if (signature === expectedSignature) {
      return email.trim().toLowerCase();
    }
  } catch (e) {
    console.error("verifyAdminTokenLocal error:", e);
  }
  return null;
}

async function getVerifiedAdminEmail(req: express.Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split(" ")[1];
  if (!token) return null;
  try {
    const email = verifyAdminTokenLocal(token);
    if (!email) return null;

    // Check if the administrator email is registered in our database
    const admins = await getAdmins();
    const cleanAdmins = admins.map(e => e.email.trim().toLowerCase());
    if (cleanAdmins.includes(email)) {
      return email;
    }
  } catch (e) {
    console.error("Token verification error:", e);
  }
  return null;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Crucial: Increase base64 limits for heavy seafood photos
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Initialize Gemini SDK with telemetry header
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey: apiKey || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // Gemini OCR endpoint for weighing scales
  app.post("/api/ocr-scale", async (req: express.Request, res: express.Response) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Không tìm thấy dữ liệu ảnh để xử lý." });
      }

      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY chưa được cấu hình trên server." });
      }

      // Pack image into the proper Gemini multipart parts
      const imagePart = {
        inlineData: {
          mimeType: mimeType || "image/jpeg",
          data: imageBase64
        }
      };

      const textPart = {
        text: `Analyze this photo taken in a restaurant kitchen of an electronic weighing scale.
Look carefully at the digital screen or LED display showing the weight of the seafood/item.
Identify the weight measurement value (the digits displaying the weight).
Return a direct JSON object containing only the following key:
{
  "kg": <number_or_null>
}
Rules:
1. ONLY return valid raw JSON.
2. If the scale displays weight in grams (g), divide by 1000 to convert to kilograms prior to output.
3. If the scale display is too blurry, turned off, completely obscured, or there is no scale, set "kg" to null.
4. DO NOT wrap the json in any markdown blocks (\`\`\`json) or additional conversational headers. Output immediate JSON only.`
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts: [imagePart, textPart] }
      });

      const responseText = response.text || "";
      console.log("Raw scale OCR Response:", responseText);

      let kg: number | null = null;
      try {
        const cleaned = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (typeof parsed.kg === "number") {
          kg = parsed.kg;
        } else if (parsed.kg === null) {
          kg = null;
        } else if (!isNaN(Number(parsed.kg))) {
          kg = Number(parsed.kg);
        }
      } catch (parseError) {
        console.error("Fallback regex parsing due to JSON parse error");
        // Fallback: match "kg": 1.23 or similar
        const match = responseText.match(/"kg"\s*:\s*([0-9.]+)/i);
        if (match && match[1]) {
          kg = parseFloat(match[1]);
        }
      }

      return res.json({ kg });
    } catch (error: any) {
      console.error("Weighing Scale OCR API Error:", error);
      return res.status(500).json({ error: error.message || "Lỗi xử lý hình ảnh và nhận diện cân." });
    }
  });

  // ---------------- BRAND NEW CUSTOM BACKEND APIs ----------------

  // 1. Butcher Auth Login by PIN
  app.post("/api/butcher/login", async (req, res) => {
    try {
      const { pin } = req.body;
      if (!pin) {
        return res.status(400).json({ error: "Vui lòng nhập mã PIN." });
      }
      
      const butchersList = await getButchers();
      // Search for active butcher with matching PIN
      const butcher = butchersList.find(b => b.pin === pin);
      
      if (!butcher) {
        return res.status(401).json({ error: "Mã PIN không đúng, vui lòng thử lại." });
      }
      if (butcher.status === "Khóa") {
        return res.status(403).json({ error: "Tài khoản của bạn đã bị khóa bởi Admin." });
      }
      
      return res.json({ success: true, butcher: { name: butcher.name, pin: butcher.pin } });
    } catch (error: any) {
      console.error("Butcher login error:", error);
      return res.status(500).json({ error: "Lỗi hệ thống khi đăng nhập." });
    }
  });

  // 1b. Admin Login by Email and Password
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Vui lòng nhập Email và Mật khẩu." });
      }
      
      const cleanEmail = email.trim().toLowerCase();
      const admins = await getAdmins();
      const matchedAdmin = admins.find(a => a.email.trim().toLowerCase() === cleanEmail);
      
      if (!matchedAdmin || matchedAdmin.password !== password) {
        return res.status(401).json({ error: "Email hoặc mật khẩu không đúng." });
      }
      
      const token = generateAdminToken(cleanEmail);
      return res.json({ success: true, email: cleanEmail, token });
    } catch (error) {
      console.error("Admin login error:", error);
      return res.status(500).json({ error: "Lỗi hệ thống khi đăng nhập admin." });
    }
  });

  // 2. Get Public Client ID for Initializing Google Sign-in Pop-up
  app.get("/api/config/public-client-id", async (req, res) => {
    try {
      const config = await getGoogleConfig();
      return res.json({ googleClientId: config.googleClientId });
    } catch (error) {
      return res.json({ googleClientId: "1053715373630-jt15fc2au8ufj1jfbth3hegrmmnflqg7.apps.googleusercontent.com" });
    }
  });

  // 3. Admin Verification using Access Token
  app.get("/api/admin/verify", async (req, res) => {
    try {
      const email = await getVerifiedAdminEmail(req);
      if (!email) {
        return res.json({ isAdmin: false, error: "Token không hợp lệ hoặc không có quyền admin." });
      }
      return res.json({ isAdmin: true, email });
    } catch (error) {
      return res.status(500).json({ isAdmin: false, error: "Lỗi kiểm tra quyền admin." });
    }
  });

  // 4. Get List of Butchers (Admin only)
  app.get("/api/admin/butchers", async (req, res) => {
    try {
      const email = await getVerifiedAdminEmail(req);
      if (!email) {
        return res.status(403).json({ error: "Bạn không có quyền truy cập." });
      }
      const list = await getButchers();
      return res.json(list);
    } catch (error) {
      return res.status(500).json({ error: "Lỗi tải danh sách butcher." });
    }
  });

  // 5. Create a New Butcher Account (Admin only)
  app.post("/api/admin/butchers", async (req, res) => {
    try {
      const email = await getVerifiedAdminEmail(req);
      if (!email) {
        return res.status(403).json({ error: "Bạn không có quyền truy cập." });
      }
      const { name, pin } = req.body;
      if (!name || !pin) {
        return res.status(400).json({ error: "Tên và mã PIN không được để trống." });
      }
      if (pin.length < 4 || pin.length > 6 || isNaN(Number(pin))) {
        return res.status(400).json({ error: "Mã PIN phải từ 4-6 chữ số." });
      }
      
      const list = await getButchers();
      if (list.some(b => b.pin === pin)) {
        return res.status(400).json({ error: "Mã PIN này đã có người sử dụng. Vui lòng chọn mã khác hoặc random." });
      }
      
      const created = await saveButcher({ name, pin, status: "Hoạt động" });
      return res.json(created);
    } catch (error) {
      return res.status(500).json({ error: "Lỗi khi tạo butcher." });
    }
  });

  // 6. Update Butcher Lock Status (Admin only)
  app.put("/api/admin/butchers/:id/status", async (req, res) => {
    try {
      const email = await getVerifiedAdminEmail(req);
      if (!email) {
        return res.status(403).json({ error: "Bạn không có quyền truy cập." });
      }
      const { id } = req.params;
      const { status } = req.body;
      if (status !== "Hoạt động" && status !== "Khóa") {
        return res.status(400).json({ error: "Trạng thái không đúng định dạng." });
      }
      await updateButcherStatus(id, status);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: "Lỗi cập nhật trạng thái." });
    }
  });

  // 7. Reset/Update Butcher PIN Code (Admin only)
  app.put("/api/admin/butchers/:id/pin", async (req, res) => {
    try {
      const email = await getVerifiedAdminEmail(req);
      if (!email) {
        return res.status(403).json({ error: "Bạn không có quyền truy cập." });
      }
      const { id } = req.params;
      const { pin } = req.body;
      if (!pin || pin.length < 4 || pin.length > 6 || isNaN(Number(pin))) {
        return res.status(400).json({ error: "Mã PIN phải từ 4-6 chữ số." });
      }
      
      const list = await getButchers();
      if (list.some(b => b.pin === pin && b.id !== id)) {
        return res.status(400).json({ error: "Mã PIN này đã có người sử dụng. Vui lòng chọn mã khác." });
      }
      
      await updateButcherPin(id, pin);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: "Lỗi đặt lại mã PIN." });
    }
  });

  // 8. Delete a Butcher Account (Admin only)
  app.delete("/api/admin/butchers/:id", async (req, res) => {
    try {
      const email = await getVerifiedAdminEmail(req);
      if (!email) {
        return res.status(403).json({ error: "Bạn không có quyền truy cập." });
      }
      const { id } = req.params;
      await deleteButcher(id);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: "Lỗi xóa tài khoản." });
    }
  });

  // 9. Get System Google Config (Admin only)
  app.get("/api/admin/config", async (req, res) => {
    try {
      const email = await getVerifiedAdminEmail(req);
      if (!email) {
        return res.status(403).json({ error: "Bạn không có quyền truy cập." });
      }
      const config = await getGoogleConfig();
      return res.json(config);
    } catch (error) {
      return res.status(500).json({ error: "Lỗi lấy cấu hình." });
    }
  });

  // 10. Update Google Config (Admin only)
  app.post("/api/admin/config", async (req, res) => {
    try {
      const email = await getVerifiedAdminEmail(req);
      if (!email) {
        return res.status(403).json({ error: "Bạn không có quyền truy cập." });
      }
      const { spreadsheetId, googleClientId, redirectUri } = req.body;
      await saveGoogleConfig({
        spreadsheetId: spreadsheetId || "",
        googleClientId: googleClientId || "",
        redirectUri: redirectUri || ""
      });
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: "Lỗi cập nhật cấu hình." });
    }
  });

  // 11. Add/List/Delete Admins in permissions collection
  app.get("/api/admin/admins", async (req, res) => {
    try {
      const email = await getVerifiedAdminEmail(req);
      if (!email) {
        return res.status(403).json({ error: "Bạn không có quyền truy cập." });
      }
      const admins = await getAdmins();
      return res.json(admins.map(a => a.email));
    } catch (error) {
      return res.status(500).json({ error: "Lỗi lấy danh sách admins." });
    }
  });

  app.post("/api/admin/admins", async (req, res) => {
    try {
      const email = await getVerifiedAdminEmail(req);
      if (!email) {
        return res.status(403).json({ error: "Bạn không có quyền truy cập." });
      }
      const { email: newAdminEmail } = req.body;
      if (!newAdminEmail || !newAdminEmail.includes("@")) {
        return res.status(400).json({ error: "Email không đúng định dạng." });
      }
      await addAdmin(newAdminEmail);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: "Lỗi thêm quản trị viên." });
    }
  });

  app.delete("/api/admin/admins/:email", async (req, res) => {
    try {
      const email = await getVerifiedAdminEmail(req);
      if (!email) {
        return res.status(403).json({ error: "Bạn không có quyền truy cập." });
      }
      const adminToDelete = req.params.email;
      if (adminToDelete.toLowerCase() === "ungchinh909@gmail.com") {
        return res.status(400).json({ error: "Không thể xóa Super Admin mặc định." });
      }
      await removeAdmin(adminToDelete);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: "Lỗi xóa quản trị viên." });
    }
  });

  // 12. Save Seafood weighing Report (Callable by any logged-in Butcher)
  app.post("/api/reports", async (req, res) => {
    try {
      const { id, seafoodName, timestamp, kg, imageData, butcherName, butcherPin, synced, driveUrl } = req.body;
      if (!seafoodName || !timestamp || !imageData) {
        return res.status(400).json({ error: "Thiếu dữ liệu báo cáo cân." });
      }
      await saveReport({
        id: id || new Date().toISOString(),
        seafoodName,
        timestamp,
        kg: kg !== undefined ? kg : null,
        imageData,
        butcherName: butcherName || "Butcher Ẩn Danh",
        butcherPin: butcherPin || "----",
        synced: !!synced,
        driveUrl: driveUrl || ""
      });
      return res.json({ success: true });
    } catch (error) {
      console.error("Save report error:", error);
      return res.status(500).json({ error: "Lỗi lưu báo cáo lên hệ thống." });
    }
  });

  // 13. Pull Latest Reports (Admin only)
  app.get("/api/admin/reports", async (req, res) => {
    try {
      const email = await getVerifiedAdminEmail(req);
      if (!email) {
        return res.status(403).json({ error: "Bạn không có quyền truy cập." });
      }
      const logs = await getReports();
      return res.json(logs);
    } catch (error) {
      return res.status(500).json({ error: "Lỗi lôi nhật ký báo cáo." });
    }
  });

  // Callback handler to bridge OAuth tokens to the iframe parent window
  app.get(["/auth/callback", "/auth/callback/"], (req: express.Request, res: express.Response) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Butcher Sync Authentication Success</title>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, sans-serif; background: #0f172a; color: #f8fafc; text-align: center; padding: 40px; }
            .spinner { border: 4px solid rgba(255,255,255,0.1); width: 36px; height: 36px; border-radius: 50%; border-left-color: #3b82f6; animation: spin 1s linear infinite; margin: 20px auto; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="spinner"></div>
          <h2>Đang kết nối tài khoản Google...</h2>
          <p>Cửa sổ này sẽ tự đóng sau khi kết nối thành công.</p>
          <script>
            // Parse Google's Implicit hash URL fragment
            function processAuth() {
              const hash = window.location.hash;
              const search = window.location.search;
              
              if (hash) {
                const params = new URLSearchParams(hash.substring(1));
                const accessToken = params.get("access_token");
                const expiresIn = params.get("expires_in");
                
                if (accessToken && window.opener) {
                  window.opener.postMessage({
                    type: "OAUTH_AUTH_SUCCESS",
                    accessToken: accessToken,
                    expiresIn: expiresIn
                  }, "*");
                  setTimeout(() => window.close(), 500);
                  return;
                }
              }
              
              if (search) {
                const queryParams = new URLSearchParams(search);
                const code = queryParams.get("code");
                const error = queryParams.get("error");
                
                if (error && window.opener) {
                  window.opener.postMessage({
                    type: "OAUTH_AUTH_FAILURE",
                    error: error
                  }, "*");
                  setTimeout(() => window.close(), 1000);
                  return;
                }
              }
              
              // If loaded without hash/search, check after a short wait
              setTimeout(() => {
                if (!window.location.hash && window.opener) {
                  window.opener.postMessage({
                    type: "OAUTH_AUTH_FAILURE",
                    error: "Không tìm thấy access token."
                  }, "*");
                  window.close();
                }
              }, 3000);
            }
            
            window.onload = processAuth;
          </script>
        </body>
      </html>
    `);
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
