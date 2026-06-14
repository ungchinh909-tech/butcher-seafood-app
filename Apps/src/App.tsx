import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Camera,
  RefreshCw,
  Database,
  Search,
  Trash2,
  Settings,
  CheckCircle,
  Calendar,
  Scale,
  ArrowLeft,
  AlertTriangle,
  UploadCloud,
  X,
  ExternalLink,
  ChevronRight,
  Info,
  Lock,
  Unlock,
  User,
  Users,
  LogOut,
  Plus,
  Key,
  Shield,
  FileSpreadsheet,
} from "lucide-react";
import {
  saveWeighingRecord,
  getAllWeighingRecords,
  deleteWeighingRecord,
  markRecordAsSynced,
  WeighingRecord,
} from "./db";
import {
  uploadImageToDrive,
  getOrCreateSpreadsheet,
  appendRowToSheet,
  getFormattedDateTime,
} from "./googleApi";

// Vietnam Seafood List matching the butcher's directory
const SEAFOOD_ITEMS = [
  "Vẹm đen China nửa vỏ",
  "Ốc bulot ĐL",
  "Hầu sữa pháp",
  "Nghêu",
  "Sò mai",
  "Sò huyết",
  "Sò lụa đỏ",
  "Tôm hùm đất ĐL",
  "Gan Ngỗng Pháp",
  "Thăn ngoại bò Aukobe",
  "Chân cua hoàng đế đông lạnh",
  "Bào ngư chile đông lạnh",
  "Sò điệp Nhật nguyên vỏ ĐL",
  "Sò tộ",
  "Sò sữa",
  "Sò dẹo",
  "Sò lông",
  "Ốc hương sống",
  "Ốc bươu",
  "Tôm sú sống",
  "Ngao sần",
  "Chân cua tuyết",
  "Tôm càng xanh sống (size 9-10 con/kg)",
  "Tôm càng xanh sống (size 10-12 con/kg)",
  "Ghẹ xanh sống",
  "Cua thịt không dây (3 con/kg)",
  "Cua thịt không dây (4 con/kg)",
  "Tôm hùm VN ngộp (size 250-350gr/con)",
  "Tôm hùm VN ngộp (size 150-200gr/con)",
  "Tôm hùm Canada hấp",
  "Tôm hùm đá Tây Úc",
  "Cua hoàng đế đỏ",
];

interface Butcher {
  id: string;
  name: string;
  pin: string;
  status: "Hoạt động" | "Khóa";
  createdAt: string;
}

interface ServerReport {
  id: string;
  seafoodName: string;
  timestamp: string;
  kg: number | null;
  imageData: string;
  butcherName: string;
  butcherPin: string;
  synced: boolean;
  driveUrl?: string;
}

export default function App() {
  // Authentication & Session States
  const [butcherSession, setButcherSession] = useState<{
    name: string;
    pin: string;
  } | null>(() => {
    const cached = localStorage.getItem("butcher_session");
    return cached ? JSON.parse(cached) : null;
  });
  const [adminToken, setAdminToken] = useState<string | null>(() =>
    localStorage.getItem("admin_token"),
  );
  const [googleToken, setGoogleToken] = useState<string | null>(() =>
    localStorage.getItem("google_token"),
  );
  const [adminEmail, setAdminEmail] = useState<string | null>(() =>
    localStorage.getItem("admin_email"),
  );

  // Views
  // 'login' | 'list' | 'camera' | 'saving' | 'synclog' | 'admin'
  const [view, setView] = useState<
    "login" | "list" | "camera" | "saving" | "synclog" | "admin"
  >("login");

  // PIN Input Pad states
  const [inputPin, setInputPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [showAdminLoginPanel, setShowAdminLoginPanel] = useState(false);

  // States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeafood, setSelectedSeafood] = useState("");
  const [localRecords, setLocalRecords] = useState<WeighingRecord[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Camera States
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [manualKg, setManualKg] = useState<string>("");
  const [noCameraAccess, setNoCameraAccess] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);

  // OCR AI states
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrResultKg, setOcrResultKg] = useState<number | null>(null);
  const [savingStatusText, setSavingStatusText] = useState("");

  // Admin Panel states
  const [adminActiveTab, setAdminActiveTab] = useState<
    "butchers" | "reports" | "config" | "admins"
  >("butchers");
  const [butchersList, setButchersList] = useState<Butcher[]>([]);
  const [adminReportsList, setAdminReportsList] = useState<ServerReport[]>([]);
  const [adminsList, setAdminsList] = useState<string[]>([]);

  // Admin Login and credentials states
  const [adminLoginEmail, setAdminLoginEmail] = useState("");
  const [adminLoginPassword, setAdminLoginPassword] = useState("");
  const [adminLoginError, setAdminLoginError] = useState("");
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);

  // Admin configs values
  const [googleClientId, setGoogleClientId] = useState(
    "1053715373630-jt15fc2au8ufj1jfbth3hegrmmnflqg7.apps.googleusercontent.com",
  );
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [redirectUri, setRedirectUri] = useState("");

  // Admin forms
  const [newButcherName, setNewButcherName] = useState("");
  const [newButcherPin, setNewButcherPin] = useState("");
  const [newAdminEmailInput, setNewAdminEmailInput] = useState("");
  const [adminActionError, setAdminActionError] = useState("");
  const [adminActionSuccess, setAdminActionSuccess] = useState("");
  const [adminSavingConfig, setAdminSavingConfig] = useState(false);

  // Sync states
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [syncErrorLog, setSyncErrorLog] = useState<string | null>(null);

  // Clock
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Network offline listener and database loads
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    loadRecords();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Determine initial view based on sessions
  useEffect(() => {
    if (butcherSession) {
      setView("list");
    } else {
      setView("login");
    }
  }, [butcherSession]);

  // Fetch verified admin statuses or reload admin lists on tab changes
  useEffect(() => {
    if (adminToken) {
      verifyAdminToken(adminToken);
    }
  }, [adminToken]);

  // Sync state loaded whenever admin logs in or views tabs
  useEffect(() => {
    if (view === "admin" && adminToken) {
      loadAdminData();
    }
  }, [view, adminActiveTab, adminToken]);

  // Listen to postMessage from Google OAuth callback popup specifically for spreadsheet synchronization
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith(".run.app") && !origin.includes("localhost")) {
        return;
      }

      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        const token = event.data.accessToken;
        if (token) {
          localStorage.setItem("google_token", token);
          setGoogleToken(token);
          alert(
            "Liên kết Google Drive & Sheets thành công! Vui lòng nhấn nút đồng bộ trở lại.",
          );
        }
      }
    };

    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, []);

  // Verify Admin email and local token on backend
  const verifyAdminToken = async (token: string) => {
    try {
      const res = await fetch("/api/admin/verify", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.isAdmin) {
          setAdminEmail(data.email);
          localStorage.setItem("admin_email", data.email);
          setView("admin");
          return;
        }
      }
      handleAdminLogout();
    } catch (e) {
      console.error("verifyAdminToken error:", e);
      handleAdminLogout();
    }
  };

  // Handle Admin Local Login
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminLoginEmail || !adminLoginPassword) {
      setAdminLoginError("Vui lòng nhập Email và Mật khẩu.");
      return;
    }
    setAdminLoginError("");
    setAdminLoginLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: adminLoginEmail,
          password: adminLoginPassword,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem("admin_token", data.token);
        localStorage.setItem("admin_email", data.email);
        setAdminToken(data.token);
        setAdminEmail(data.email);
        setView("admin");
        setShowAdminLoginPanel(false);
        setAdminLoginEmail("");
        setAdminLoginPassword("");
      } else {
        setAdminLoginError(
          data.error || "Email hoặc Mật khẩu không chính xác.",
        );
      }
    } catch (err) {
      console.error("Lỗi đăng nhập admin:", err);
      setAdminLoginError("Hiện tại không thể liên kết đến máy chủ.");
    } finally {
      setAdminLoginLoading(false);
    }
  };

  // Admin Logout helper
  const handleAdminLogout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_email");
    setAdminToken(null);
    setAdminEmail(null);
    setView("login");
  };

  // Google OAuth popup for Spreadsheet/Drive synchronization authorization
  const launchGoogleOAuth = () => {
    const redirect = `${window.location.origin}/auth/callback`;
    const scopes =
      "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file";
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${encodeURIComponent(redirect)}&response_type=token&scope=${encodeURIComponent(scopes)}&include_granted_scopes=true&prompt=consent`;

    const popup = window.open(
      url,
      "google_oauth_popup",
      "width=550,height=650,left=150,top=100",
    );

    if (!popup) {
      alert(
        "Trình duyệt đã chặn cửa sổ Pop-up. Vui lòng cho phép hiện Pop-up và thử lại!",
      );
    }
  };

  // Load records from local DB
  const loadRecords = async () => {
    try {
      const records = await getAllWeighingRecords();
      setLocalRecords(records);
    } catch (err) {
      console.error("Lỗi tải bản ghi local:", err);
    }
  };

  // Load admin tab data
  const loadAdminData = async () => {
    if (!adminToken) return;
    try {
      if (adminActiveTab === "butchers") {
        const res = await fetch("/api/admin/butchers", {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (res.ok) {
          const list = await res.json();
          setButchersList(list);
        }
      } else if (adminActiveTab === "reports") {
        const res = await fetch("/api/admin/reports", {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (res.ok) {
          const list = await res.json();
          setAdminReportsList(list);
        }
      } else if (adminActiveTab === "config") {
        const res = await fetch("/api/admin/config", {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSpreadsheetId(data.spreadsheetId || "");
          setGoogleClientId(data.googleClientId || "");
          setRedirectUri(data.redirectUri || "");
        }
      } else if (adminActiveTab === "admins") {
        const res = await fetch("/api/admin/admins", {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (res.ok) {
          const list = await res.json();
          setAdminsList(list);
        }
      }
    } catch (e) {
      console.error("loadAdminData tab error:", e);
    }
  };

  // Butcher auth PIN code entry logic
  const handlePinSubmit = async () => {
    if (!inputPin) return;
    setPinLoading(true);
    setPinError("");
    try {
      const res = await fetch("/api/butcher/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: inputPin }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setButcherSession(data.butcher);
        localStorage.setItem("butcher_session", JSON.stringify(data.butcher));
        setInputPin("");
        setView("list");
      } else {
        setPinError(data.error || "Sai mã PIN, vui lòng thử lại.");
        setInputPin("");
      }
    } catch (err) {
      setPinError("Không thể kết nối Internet đến máy chủ.");
    } finally {
      setPinLoading(false);
    }
  };

  // Keypad keys handlers
  const handleKeyPress = (num: string) => {
    setPinError("");
    if (inputPin.length < 6) {
      setInputPin((prev) => prev + num);
    }
  };

  const handleBackspace = () => {
    setInputPin((prev) => prev.slice(0, -1));
  };

  const handleClearAll = () => {
    setInputPin("");
  };

  // Butcher signout
  const handleButcherLogout = () => {
    localStorage.removeItem("butcher_session");
    setButcherSession(null);
    setView("login");
  };

  // Admin Butcher account ops
  const handleCreateButcher = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminActionError("");
    setAdminActionSuccess("");
    if (!newButcherName || !newButcherPin) {
      setAdminActionError("Điền đầy đủ tên và mã PIN.");
      return;
    }
    try {
      const res = await fetch("/api/admin/butchers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ name: newButcherName, pin: newButcherPin }),
      });
      const data = await res.json();
      if (res.ok) {
        setAdminActionSuccess(
          `Đã cấp Butcher "${data.name}" khóa PIN: ${data.pin}`,
        );
        setNewButcherName("");
        setNewButcherPin("");
        loadAdminData();
      } else {
        setAdminActionError(data.error || "Không thể khởi tạo Butcher mới.");
      }
    } catch (err) {
      setAdminActionError("Lỗi hệ thống.");
    }
  };

  const handleStatusToggle = async (
    id: string,
    currentStatus: "Hoạt động" | "Khóa",
  ) => {
    const nextStatus = currentStatus === "Hoạt động" ? "Khóa" : "Hoạt động";
    try {
      const res = await fetch(`/api/admin/butchers/${id}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        loadAdminData();
      } else {
        alert("Lỗi đổi trạng thái tài khoản butcher.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetPin = async (id: string) => {
    const nextPin = Math.floor(100000 + Math.random() * 900000).toString(); // generate auto 6 numbers
    if (
      window.confirm(
        `Bạn có chắc muốn đặt lại mã PIN ngẫu nhiên mới: ${nextPin} cho butcher này?`,
      )
    ) {
      try {
        const res = await fetch(`/api/admin/butchers/${id}/pin`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ pin: nextPin }),
        });
        if (res.ok) {
          alert(`Đổi mã PIN mới thành công: ${nextPin}`);
          loadAdminData();
        } else {
          const data = await res.json();
          alert(data.error || "Lỗi reset PIN.");
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleDeleteButcher = async (id: string, name: string) => {
    if (
      window.confirm(
        `XÓA tài khoản Butcher "${name}" này vĩnh viễn? Họ sẽ mất quyền cân.`,
      )
    ) {
      try {
        const res = await fetch(`/api/admin/butchers/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (res.ok) {
          loadAdminData();
        } else {
          alert("Lỗi máy chủ khi xóa butcher.");
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Add sub-admins email
  const handleAddAdminEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmailInput || !newAdminEmailInput.includes("@")) return;
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ email: newAdminEmailInput }),
      });
      if (res.ok) {
        setNewAdminEmailInput("");
        loadAdminData();
      } else {
        const text = await res.json();
        alert(text.error || "Lỗi ủy quyền admin.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAdminEmail = async (emailToDelete: string) => {
    if (window.confirm(`Hủy bỏ quyền Admin của email: ${emailToDelete}?`)) {
      try {
        const res = await fetch(
          `/api/admin/admins/${encodeURIComponent(emailToDelete)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${adminToken}` },
          },
        );
        if (res.ok) {
          loadAdminData();
        } else {
          const text = await res.json();
          alert(text.error || "Gặp sự cố khi rút quyền.");
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Save Config system
  const handleSaveConfigs = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminSavingConfig(true);
    setAdminActionError("");
    setAdminActionSuccess("");
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          spreadsheetId,
          googleClientId,
          redirectUri,
        }),
      });
      if (res.ok) {
        setAdminActionSuccess(
          "Đã ghi nhận cấu hình lên Firestore Cloud an toàn!",
        );
      } else {
        setAdminActionError("Lỗi đồng bộ cấu hình.");
      }
    } catch (err) {
      setAdminActionError("Lỗi đường truyền.");
    } finally {
      setAdminSavingConfig(false);
    }
  };

  // Camera start / stop / sounds
const startCamera = async () => {
  setCameraLoading(true);
  setNoCameraAccess(false);
  setCapturedImage(null);
  setManualKg("");
  setOcrResultKg(null);

  try {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }

    // Cấu hình camera tối ưu cho cả Android và iOS
    const constraints = {
      video: {
        facingMode: { exact: "environment" }, // ưu tiên camera sau
        width: { ideal: 1280 },
        height: { ideal: 720 },
        aspectRatio: { ideal: 1.7777777778 }, // 16:9
      },
      audio: false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    setCameraStream(stream);
    
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.setAttribute("playsinline", "true"); // QUAN TRỌNG: fix lỗi iOS hiện trình phát video
      videoRef.current.setAttribute("autoplay", "true");
      await videoRef.current.play();
    }
  } catch (error) {
    console.warn("Camera error:", error);
    
    // Fallback: nếu exact environment thất bại, thử không có facingMode
    try {
      const fallbackConstraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };
      const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
      setCameraStream(fallbackStream);
      if (videoRef.current) {
        videoRef.current.srcObject = fallbackStream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
      }
    } catch (fallbackError) {
      setNoCameraAccess(true);
    }
  } finally {
    setCameraLoading(false);
  }
};
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  const playFakeShutterSound = () => {
    try {
      const audioCtx = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        120,
        audioCtx.currentTime + 0.15,
      );
      gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioCtx.currentTime + 0.15,
      );
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      console.log("Audio feedback rejected:", e);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    playFakeShutterSound();
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      setCapturedImage(dataUrl);
      stopCamera();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setCapturedImage(reader.result as string);
        stopCamera();
      };
      reader.readAsDataURL(file);
    }
  };

  // Butcher save captured weight
  const processAndSaveRecord = async () => {
    if (!capturedImage || !butcherSession) return;

    setView("saving");
    setOcrRunning(true);
    setSavingStatusText("Đang lưu trữ tạm ngoại tuyến...");

    const id = new Date().toISOString();
    const timestampStr = getFormattedDateTime();

    // Create record structure with Butcher identity
    const preRecord: WeighingRecord = {
      id,
      seafoodName: selectedSeafood,
      timestamp: timestampStr,
      kg: manualKg ? parseFloat(manualKg) : null,
      imageData: capturedImage,
      synced: false,
      butcherName: butcherSession.name,
      butcherPin: butcherSession.pin,
    };

    // Store in IndexedDB as 100% reliable local crash backup
    try {
      await saveWeighingRecord(preRecord);
      await loadRecords();
    } catch (dbErr) {
      console.error("Local indexed DB failed", dbErr);
    }

    // Try server post-up immediately if online
    let finalKg: number | null = manualKg ? parseFloat(manualKg) : null;
    if (isOnline) {
      if (!manualKg) {
        setSavingStatusText("Đang nhận dạng số cân điện tử bằng AI...");
        try {
          const base64Clean = capturedImage.split(",")[1] || capturedImage;
          const response = await fetch("/api/ocr-scale", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: baseClean(base64Clean),
              mimeType: "image/jpeg",
            }),
          });
          if (response.ok) {
            const resJson = await response.json();
            if (resJson.kg !== undefined && resJson.kg !== null) {
              finalKg = parseFloat(resJson.kg);
              setOcrResultKg(finalKg);
              // Re-update IndexedDB with AI weight
              await saveWeighingRecord({ ...preRecord, kg: finalKg });
              await loadRecords();
            }
          }
        } catch (ocrErr) {
          console.warn("AI OCR background errored", ocrErr);
        }
      }

      setSavingStatusText("Đang đồng bộ lên Firestore Cloud...");
      try {
        await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            seafoodName: selectedSeafood,
            timestamp: timestampStr,
            kg: finalKg,
            imageData: capturedImage,
            butcherName: butcherSession.name,
            butcherPin: butcherSession.pin,
            synced: false,
          }),
        });
      } catch (err) {
        console.warn(
          "Could not post live to Firestore reports, queued for admin sync",
          err,
        );
      }
    }

    setOcrRunning(false);
    setSavingStatusText("Đã lưu bản ghi thành công!");

    setTimeout(() => {
      setView("list");
      setSelectedSeafood("");
      setCapturedImage(null);
      setManualKg("");
      setOcrResultKg(null);
    }, 1800);
  };

  const baseClean = (str: string) => {
    return str.split(",").length > 1 ? str.split(",")[1] : str;
  };

  // Admin spreadsheet appender/syncing offline data
  const syncOfflineRecordsToSheets = async () => {
    if (!adminToken) {
      alert(
        "Phiên làm việc Quản Trị Viên đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại!",
      );
      handleAdminLogout();
      return;
    }

    if (!googleToken) {
      alert(
        "Hệ thống yêu cầu quyền truy cập Google Drive & Sheets để lưu báo cáo. Vui lòng cấp quyền trong cửa sổ tiếp theo.",
      );
      launchGoogleOAuth();
      return;
    }

    // Fetch latest reports that are NOT marked synced
    const unsyncedLogs = localRecords.filter((r) => !r.synced);
    if (unsyncedLogs.length === 0) {
      alert("Tất cả các dòng dữ liệu local đã được đồng bộ!");
      return;
    }

    setSyncingAll(true);
    setSyncErrorLog(null);
    setSyncProgress({ current: 0, total: unsyncedLogs.length });

    try {
      let activeSpreadsheetId = spreadsheetId;
      if (!activeSpreadsheetId) {
        activeSpreadsheetId = await getOrCreateSpreadsheet(googleToken);
        setSpreadsheetId(activeSpreadsheetId);
        // Save back to db
        await fetch("/api/admin/config", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            spreadsheetId: activeSpreadsheetId,
            googleClientId,
            redirectUri,
          }),
        });
      }

      for (let i = 0; i < unsyncedLogs.length; i++) {
        const record = unsyncedLogs[i];
        setSyncProgress({ current: i + 1, total: unsyncedLogs.length });

        try {
          // Upload photo to Google Drive
          const fileName = `butcher_${(record.butcherName || "Seafood").replace(/\s+/g, "_")}_${record.id.replace(/[:.]/g, "-")}.jpg`;
          const driveUrl = await uploadImageToDrive(
            googleToken,
            fileName,
            record.imageData,
          );
          console.log("Uploaded to Drive, URL:", driveUrl);
          // Append to Google Sheets: | Thời gian | Tên Butcher | Mã PIN | Mặt hàng | Số kg | Đường dẫn ảnh | Trạng thái |
         await appendRowToSheet(googleToken, activeSpreadsheetId, [
  record.timestamp,
  record.butcherName || "Không rõ",
  record.butcherPin || "----",
  record.seafoodName,
  record.kg !== null ? record.kg : "",
  driveUrl,
  "Đã đồng bộ",
]);
console.log("Appended to Sheets for record:", record.id);

          // Update IndexedDB
          await markRecordAsSynced(record.id, driveUrl);

          // Try to update report document on Firestore to synced state
          await fetch("/api/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...record,
              synced: true,
              driveUrl,
            }),
          });
        } catch (individualErr: any) {
          console.error(individualErr);
          setSyncErrorLog(
            `Sự cố bản ghi lúc ${record.timestamp}: ${individualErr.message || "Kiểm tra quyền truy cập Google Drive"}`,
          );
          if (
            individualErr.message?.includes("401") ||
            individualErr.message?.includes("expired")
          ) {
            setGoogleToken(null);
            localStorage.removeItem("google_token");
            throw new Error(
              "Phiên làm việc Google Sheets đã hết hạn. Vui lòng bấm đồng bộ lại để ủy quyền!",
            );
          }
        }
      }

      await loadRecords();
      loadAdminData();
      if (!syncErrorLog) {
        alert("Đồng bộ thành công dữ liệu lên Google Sheets!");
      }
    } catch (syncErr: any) {
      alert(`Đồng bộ gián đoạn: ${syncErr.message || syncErr}`);
    } finally {
      setSyncingAll(false);
    }
  };

  const filteredProducts = SEAFOOD_ITEMS.filter((item) =>
    item.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const timeString = currentTime.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dateString = currentTime.toLocaleDateString("vi-VN", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });

  return (
    <div className="h-screen w-screen bg-[#05070a] text-slate-100 flex flex-col font-sans select-none antialiased overflow-hidden">
      {/* HIGH-DENSITY TITLE BAR */}
      <header className="flex-shrink-0 flex items-center justify-between px-3.5 sm:px-6 py-2.5 sm:py-3 bg-[#0f172a] border-b border-slate-800">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 h-9 bg-blue-600 rounded-lg flex-shrink-0 flex items-center justify-center font-bold text-base sm:text-lg text-white shadow-md">
            <Scale className="w-4 h-4 sm:w-5 h-5 animate-pulse" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold leading-none tracking-wider text-white uppercase flex items-center gap-1 sm:gap-2">
              <span className="truncate">Butcher Seafood</span>
              <span className="hidden sm:inline-block px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] font-mono rounded">
                v2.0
              </span>
            </h1>
            {butcherSession ? (
              <p className="text-[9px] sm:text-[10px] text-emerald-400 font-bold mt-1 flex items-center gap-1 truncate">
                <User className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="truncate">
                  NV: {butcherSession.name} ({butcherSession.pin})
                </span>
              </p>
            ) : (
              <p className="text-[9px] sm:text-[10px] text-slate-400 font-medium mt-1 truncate">
                Ghi nhận số cân
              </p>
            )}
          </div>
        </div>

        {/* Status Indicators & Clock Row */}
        <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
          <div className="flex items-center gap-1 sm:gap-2 bg-[#080c14]/50 border border-slate-800 px-1.5 sm:px-2.5 py-1 rounded-lg">
            <div className="flex gap-0.5 items-end h-2.5 pb-0.5">
              <div
                className={`w-0.5 rounded-t-sm h-1 ${isOnline ? "bg-emerald-500" : "bg-slate-700"}`}
              ></div>
              <div
                className={`w-0.5 rounded-t-sm h-2 ${isOnline ? "bg-emerald-500" : "bg-slate-700"}`}
              ></div>
              <div
                className={`w-0.5 rounded-t-sm h-2.5 ${isOnline ? "bg-emerald-500" : "bg-slate-700"}`}
              ></div>
              <div
                className={`w-0.5 rounded-t-sm h-3 ${isOnline ? "bg-emerald-500" : "bg-slate-700"}`}
              ></div>
            </div>
            <span className="text-[8px] sm:text-[9px] font-mono uppercase tracking-tight text-slate-300 font-bold">
              {isOnline ? "ON" : "OFF"}
            </span>
          </div>

          <div className="hidden md:flex flex-col text-right border-l border-slate-800 pr-1 pl-4">
            <div className="text-sm font-mono leading-none font-bold text-slate-100 tracking-wider">
              {timeString}
            </div>
            <div className="text-[8px] text-slate-500 uppercase tracking-widest mt-0.5">
              {dateString}
            </div>
          </div>

          {/* Logout triggers */}
          {butcherSession && (
            <button
              onClick={handleButcherLogout}
              className="p-1 px-2 sm:p-1.5 rounded transition-all bg-[#0a101b] border border-slate-800 hover:bg-slate-800 text-red-00 active:scale-95 flex items-center justify-center cursor-pointer text-red-400"
              title="Đăng xuất khỏi ca làm việc"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}

          {adminToken && (
            <button
              onClick={() => setView(view === "admin" ? "list" : "admin")}
              className={`px-1.5 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-[8px] sm:text-[9px] font-bold uppercase transition-all flex items-center justify-center gap-1 border cursor-pointer ${
                view === "admin"
                  ? "bg-indigo-600 border-indigo-500 text-white shadow-indigo-900"
                  : "bg-indigo-950/20 hover:bg-slate-800 text-indigo-400 border-indigo-900/30"
              }`}
            >
              <Shield className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">
                Quản trị ({adminEmail?.split("@")[0]})
              </span>
              <span className="sm:hidden">Admin</span>
            </button>
          )}
        </div>
      </header>

      {/* RE-ARCHITECTED GRAPHICS VIEWPORT */}
      <main className="flex-1 flex overflow-hidden flex-col bg-[#05070a]">
        <AnimatePresence mode="wait">
          {/* VIEW 1: PIN CODE SCREEN KEYPAD */}
          {view === "login" && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex-1 flex flex-col items-center justify-center p-6 bg-radial from-[#0e1726] to-[#04060b] overflow-y-auto"
            >
              <div className="w-full max-w-sm bg-[#0e1626] border border-slate-800 p-6 rounded-2xl shadow-2xl flex flex-col space-y-5">
                <div className="text-center space-y-1">
                  <div className="w-12 h-12 bg-blue-600/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                    <Key className="w-6 h-6" />
                  </div>
                  <h2 className="text-lg font-black text-white uppercase tracking-wider">
                    Hệ Thống Ghi Cân Butcher
                  </h2>
                  <p className="text-xs text-slate-400 font-bold">
                    Vui lòng nhập Mã PIN cá nhân của bạn
                  </p>
                </div>

                {/* Input mask preview bubbles */}
                <div className="flex flex-col space-y-2">
                  <div className="h-10 bg-[#05070a] border border-slate-800 rounded-xl flex items-center justify-center gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <span
                        key={i}
                        className={`w-3.5 h-3.5 rounded-full transition-all duration-100 ${
                          i < inputPin.length
                            ? "bg-blue-500 scale-110 shadow-md shadow-blue-500/20"
                            : "bg-slate-800 border border-slate-700"
                        }`}
                      ></span>
                    ))}
                  </div>

                  {pinError && (
                    <p className="text-center font-bold text-red-400 text-[10px] uppercase tracking-wide animate-pulse">
                      {pinError}
                    </p>
                  )}
                </div>

                {/* KEYPAD NUMERIC */}
                <div className="grid grid-cols-3 gap-2 pb-1">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleKeyPress(num)}
                      className="py-3 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 hover:border-slate-700 text-white font-extrabold text-base active:scale-95 transition-all cursor-pointer"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="py-3 bg-[#1d0e11] hover:bg-[#2e151a] border border-dashed border-[#441c22] rounded-xl text-red-400 font-bold text-[10px] uppercase active:scale-95 transition-all cursor-pointer"
                  >
                    Xóa hết
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeyPress("0")}
                    className="py-3 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 hover:border-slate-700 text-white font-extrabold text-base active:scale-95 transition-all cursor-pointer"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handleBackspace}
                    className="py-3 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 hover:border-slate-700 text-slate-300 font-bold text-xs select-none active:scale-95 transition-all cursor-pointer"
                  >
                    Xóa lùi
                  </button>
                </div>

                {/* Login button submission */}
                <button
                  type="button"
                  onClick={handlePinSubmit}
                  disabled={pinLoading || inputPin.length < 4}
                  className={`w-full py-3 rounded-xl font-extrabold text-xs uppercase tracking-widest transition-all ${
                    inputPin.length >= 4 && !pinLoading
                      ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/25 active:scale-98 cursor-pointer"
                      : "bg-[#0c121d] border border-slate-800 text-slate-600 cursor-not-allowed"
                  }`}
                >
                  {pinLoading
                    ? "Đang xác thực bảo mật..."
                    : "XÁC NHẬN ĐĂNG NHẬP"}
                </button>

                {/* Super admin login route */}
                <div className="border-t border-slate-850 pt-4 flex flex-col items-center">
                  {!showAdminLoginPanel ? (
                    <button
                      type="button"
                      onClick={() => setShowAdminLoginPanel(true)}
                      className="text-[10px] text-slate-500 font-extrabold hover:text-indigo-400 uppercase tracking-widest transition-colors cursor-pointer"
                    >
                      Bảng Quản Lý Admin
                    </button>
                  ) : (
                    <form
                      onSubmit={handleAdminLogin}
                      className="w-full space-y-3 bg-[#05080f]/60 p-4 rounded-xl border border-slate-800 flex flex-col items-stretch text-left"
                    >
                      <span className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-widest block text-center mb-1">
                        ĐĂNG NHẬP ADMIN
                      </span>

                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                          Email Admin
                        </label>
                        <input
                          type="email"
                          required
                          value={adminLoginEmail}
                          onChange={(e) => setAdminLoginEmail(e.target.value)}
                          placeholder="admin@butcher.com"
                          className="w-full px-3 py-2 bg-[#090d16] border border-slate-800 focus:border-indigo-500 rounded-lg text-base md:text-xs text-white placeholder-slate-600 focus:outline-none transition-colors"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                          Mật khẩu
                        </label>
                        <input
                          type="password"
                          required
                          value={adminLoginPassword}
                          onChange={(e) =>
                            setAdminLoginPassword(e.target.value)
                          }
                          placeholder="••••••••"
                          className="w-full px-3 py-2 bg-[#090d16] border border-slate-800 focus:border-indigo-500 rounded-lg text-base md:text-xs text-white placeholder-slate-600 focus:outline-none transition-colors"
                        />
                      </div>

                      {adminLoginError && (
                        <span className="text-[10px] text-red-500 font-medium block text-center leading-tight">
                          {adminLoginError}
                        </span>
                      )}

                      <button
                        type="submit"
                        disabled={adminLoginLoading}
                        className="w-full py-2 bg-indigo-650 hover:bg-indigo-600 active:scale-98 transition-all text-white font-extrabold text-[10px] uppercase tracking-widest rounded-lg flex items-center justify-center gap-1 border border-indigo-500 cursor-pointer shadow-md shadow-indigo-600/10"
                      >
                        {adminLoginLoading ? "ĐANG ĐĂNG NHẬP..." : "XÁC NHẬN"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowAdminLoginPanel(false);
                          setAdminLoginError("");
                        }}
                        className="text-[9px] text-[#4285F4] hover:text-white block text-center mt-1 uppercase"
                      >
                        Đóng mục này
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* VIEW 2: BUTCHER LIST DIRECTORY */}
          {view === "list" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col overflow-hidden lg:flex-row"
            >
              {/* Directory panel list */}
              <section className="flex-1 bg-[#080c14]/90 p-4 overflow-y-auto flex flex-col">
                <div className="flex flex-col sm:flex-row gap-2 mb-4 flex-shrink-0">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="w-4 h-4 text-slate-500" />
                    </div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tra cứu tên hải sản..."
                      className="w-full pl-9 pr-8 bg-[#05070a] text-slate-100 placeholder-slate-500 font-semibold text-base md:text-xs rounded-lg border border-slate-800 focus:outline-none focus:border-blue-500 py-2 sm:py-2.5"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => setView("synclog")}
                    className="px-3.5 py-2 bg-[#0f172a] hover:bg-slate-800 border border-slate-800 rounded-lg font-bold text-xs flex items-center justify-between gap-2 shadow text-slate-300"
                  >
                    <div className="flex items-center gap-1.5">
                      <Database className="w-4 h-4 text-blue-500" />
                      <span>Kho tạm lưu</span>
                    </div>
                    <span className="bg-blue-600/15 text-blue-400 px-1.5 py-0.5 rounded text-[10px] font-bold border border-blue-500/20">
                      {localRecords.length}
                    </span>
                  </button>
                </div>

                <div className="flex items-center justify-between mb-2 flex-shrink-0 px-1">
                  <p className="text-[10px] font-bold tracking-widest text-[#576882] uppercase font-mono">
                    Danh mục Buffet ({filteredProducts.length} mặt hàng)
                  </p>
                  <p className="text-[9px] text-[#576882] italic hidden sm:block">
                    Chọn 1 mặt hải sản để ghi nhận số kg
                  </p>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-2 pb-6">
                    {filteredProducts.map((seafood) => {
                      const originalIndex = SEAFOOD_ITEMS.indexOf(seafood) + 1;
                      const formattedIndex = String(originalIndex).padStart(
                        2,
                        "0",
                      );
                      return (
                        <motion.button
                          whileTap={{ scale: 0.96 }}
                          key={seafood}
                          onClick={() => {
                            setSelectedSeafood(seafood);
                            setView("camera");
                            startCamera();
                          }}
                          className="relative flex flex-col items-start justify-between p-3.5 rounded-lg border text-left bg-[#0c1322] border-slate-800 text-slate-100 hover:bg-slate-850 hover:border-blue-500/40 min-h-[82px] cursor-pointer"
                        >
                          <span className="text-[10px] font-mono font-bold mb-1 text-slate-500 block">
                            {formattedIndex}
                          </span>
                          <span className="font-extrabold leading-tight text-[11px] tracking-tight uppercase line-clamp-2">
                            {seafood}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Simple Help Panel for Butcher on selection */}
              <section className="hidden lg:flex w-80 bg-[#0c121d] p-5 overflow-y-auto flex-col justify-between border-l border-slate-800/80">
                <div className="space-y-4">
                  <div className="bg-[#0f172a] p-4 rounded-lg border border-slate-800">
                    <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest font-mono mb-2">
                      Thông Tin Vận Hành
                    </h3>
                    <p className="text-[10px] text-slate-400 leading-relaxed font-bold">
                      Hệ thống ghi nhận và kiểm đếm thịt buffet. Nhấn chọn bất
                      kỳ dòng seafood nào bên để mở camera thiết bị hoặc máy
                      ảnh.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[9px] font-black uppercase text-[#576882] tracking-widest pl-1 font-mono">
                      Quy trình ghi số kg
                    </h4>
                    <div className="flex items-start gap-2.5 p-2 bg-[#0c1322]/40 rounded border border-slate-850/40">
                      <span className="w-5 h-5 rounded bg-[#101b33] text-blue-400 border border-blue-900/20 flex items-center justify-center font-bold text-[9px]">
                        01
                      </span>
                      <p className="text-[10px] text-slate-400 leading-snug font-bold">
                        Đặt khay hải sản lên bàn cân.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5 p-2 bg-[#0c1322]/40 rounded border border-slate-850/40">
                      <span className="w-5 h-5 rounded bg-[#101b33] text-blue-400 border border-blue-900/20 flex items-center justify-center font-bold text-[9px]">
                        02
                      </span>
                      <p className="text-[10px] text-slate-400 leading-snug font-bold">
                        Chọn hải sản rồi chụp hình hiển thị mặt số cân.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#0f172a] p-4 rounded-lg border border-slate-800 text-center text-[10px] font-mono text-slate-500">
                  <span>Hệ thống Butcher Buffet</span>
                </div>
              </section>
            </motion.div>
          )}

          {/* VIEW 3: CAMERA FLOW SCANNER */}
          {view === "camera" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto max-w-xl mx-auto w-full"
            >
              <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-3.5 flex justify-between items-center flex-shrink-0">
                <div className="min-w-0 flex-1 pr-2">
                  <span className="text-[8px] uppercase tracking-widest text-slate-500 font-extrabold block">
                    Đang Ghi Cân Buffet
                  </span>
                  <h3 className="text-white font-black text-xs uppercase leading-tight truncate mt-1">
                    {selectedSeafood}
                  </h3>
                </div>

                <button
                  onClick={() => {
                    stopCamera();
                    setView("list");
                    setSelectedSeafood("");
                  }}
                  className="px-2.5 py-1 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded text-[9px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-2.5 h-2.5" />
                  <span>Đổi mã</span>
                </button>
              </div>

              {/* Viewfinder block */}
       <div className="bg-slate-950 rounded-lg border border-slate-850 relative overflow-hidden flex flex-col items-center justify-center w-full" style={{ aspectRatio: '16/9', maxWidth: '100%' }}>
  <div className="absolute inset-3 border border-white/5 border-dashed rounded-lg pointer-events-none z-10"></div>
  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/5 h-1/3 border border-dashed border-blue-500/60 rounded flex items-center justify-center pointer-events-none z-10">
    <span className="text-[8px] bg-[#0c121d] px-1 text-blue-400 absolute -top-2.5 uppercase font-black tracking-widest whitespace-nowrap">
      Ô Đọc Số Cân
    </span>
    <span className="absolute -top-0.5 -left-0.5 w-3 h-3 border-t-2 border-l-2 border-blue-500"></span>
    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 border-t-2 border-r-2 border-blue-500"></span>
    <span className="absolute -bottom-0.5 -left-0.5 w-3 h-3 border-b-2 border-l-2 border-blue-500"></span>
    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 border-b-2 border-r-2 border-blue-500"></span>
  </div>

  {!noCameraAccess && !capturedImage && (
    <div className="absolute inset-0 w-full h-full">
      {cameraLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 z-20">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-500 mb-1.5" />
          <span className="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
            Khởi Động Camera...
          </span>
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }} // Tự động sửa ảnh bị lộn ngược trên một số máy
      />
    </div>
  )}

  {(noCameraAccess || capturedImage) && (
    <div className="absolute inset-0 w-full h-full bg-slate-950 flex flex-col items-center justify-center p-4">
      {capturedImage ? (
        <img
          src={capturedImage}
          alt="Captured preview"
          referrerPolicy="no-referrer"
          className="w-full h-full object-contain rounded"
        />
      ) : (
        <div className="text-center p-4 z-10">
          <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-1.5" />
          <p className="text-[10px] text-slate-400 mb-3 max-w-[200px] mx-auto">
            Camera bị hạn chế, vui lòng chụp ảnh thủ công.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[9px] rounded uppercase cursor-pointer"
          >
            Chọn ảnh từ thư viện
          </button>
        </div>
      )}
    </div>
  )}

  <input
    ref={fileInputRef}
    type="file"
    accept="image/*"
    capture="environment"
    onChange={handleFileSelect}
    className="hidden"
  />

  {!capturedImage && !noCameraAccess && (
    <div className="absolute bottom-3.5 flex flex-col items-center z-20">
      <button
        onClick={capturePhoto}
        className="w-11 h-11 bg-white hover:bg-slate-100 rounded-full border-4 border-slate-900 flex items-center justify-center active:scale-90 transition-transform cursor-pointer"
      >
        <div className="w-5 h-5 rounded-full bg-red-600"></div>
      </button>
      <span className="mt-1 text-[8px] tracking-widest text-[#576882] font-black uppercase bg-slate-950/80 px-1 py-0.5 rounded">
        NHẤN CHỤP ẢNH
      </span>
    </div>
  )}
</div>

              {/* Weight edit fields */}
              <div className="bg-[#0f172a] p-3.5 rounded-lg border border-slate-800 space-y-2 flex-shrink-0">
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block border-b border-slate-800 pb-1.5">
                  NHẬP CHI TIẾT SỐ CÂN
                </span>
                <div className="flex justify-between items-center text-xs pb-1 border-b border-dashed border-slate-805">
                  <span className="text-slate-400">Trạng thái:</span>
                  <span
                    className={`font-mono text-[9px] font-bold ${capturedImage ? "text-emerald-450" : "text-amber-400 animate-pulse"}`}
                  >
                    {capturedImage ? "ĐÃ CHỤP HÌNH" : "ĐANG CHỜ CHỤP"}
                  </span>
                </div>

                {capturedImage && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[9px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                        <Scale className="w-3.5 h-3.5 text-blue-500" />
                        <span>Mã số kg thực tế:</span>
                      </label>
                      <span className="text-[8px] text-slate-500">
                        Mặc định dùng AI, hoặc tự điền
                      </span>
                    </div>

                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={manualKg}
                        onChange={(e) => setManualKg(e.target.value)}
                        placeholder="Nhập số kg ví dụ: 3.45"
                        className="w-full bg-[#05070a] border border-slate-805 rounded px-3 py-2 text-base md:text-xs font-black text-white focus:outline-none focus:border-blue-500 font-mono"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-500">
                        KG
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Submit actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setCapturedImage(null);
                    setManualKg("");
                    if (!noCameraAccess) startCamera();
                  }}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-800 font-bold uppercase rounded text-[9px] cursor-pointer"
                >
                  Bỏ / Chụp Lại
                </button>

                <button
                  onClick={processAndSaveRecord}
                  disabled={!capturedImage}
                  className={`flex-1 py-1.5 font-bold uppercase rounded text-[9px] transition-all flex items-center justify-center gap-1.5 border ${
                    capturedImage
                      ? "bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white shadow shadow-emerald-950/20 cursor-pointer"
                      : "bg-[#0c1322] text-slate-600 cursor-not-allowed border-slate-800"
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Xác nhận & Lưu</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* VIEW 4: SAVING SPINNER WRAP */}
          {view === "saving" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center py-16 text-center bg-[#05070a]"
            >
              <div className="w-24 h-24 rounded-full bg-[#0e1626] border border-slate-800 flex items-center justify-center shadow-2xl relative mb-6">
                {ocrRunning ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        repeat: Infinity,
                        duration: 1.5,
                        ease: "linear",
                      }}
                      className="absolute inset-0 rounded-full border-t-2 border-r-2 border-red-500"
                    ></motion.div>
                    <Scale className="w-10 h-10 text-red-500 animate-pulse" />
                  </>
                ) : (
                  <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg">
                    <CheckCircle className="w-9 h-9" />
                  </div>
                )}
              </div>

              <h3 className="text-lg font-black text-white mb-1.5">
                Báo Cáo Butcher Buffet
              </h3>
              <p className="text-slate-400 font-bold text-sm max-w-xs">
                {savingStatusText}
              </p>

              {ocrResultKg !== null && (
                <div className="mt-5 bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-2Inline">
                  <span className="text-[9px] text-[#576882] uppercase tracking-wider block">
                    AI nhận dạng được:
                  </span>
                  <p className="text-emerald-400 font-extrabold text-xl font-mono">
                    {ocrResultKg} KG
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* VIEW 5: LOGS AND CACHED HISTORY */}
          {view === "synclog" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col p-4 max-w-2xl mx-auto w-full space-y-4 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setView("list")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-slate-300 font-bold bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 text-[10px] uppercase cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Trở lại danh sách</span>
                </button>
                <div className="text-[10px] font-mono text-[#576882] uppercase">
                  Hộp dữ liệu tạm ngoại tuyến
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                  <span className="text-[8px] uppercase font-bold text-slate-500 tracking-wider">
                    Chưa đồng bộ
                  </span>
                  <p className="text-2xl font-black text-amber-500 mt-0.5">
                    {localRecords.filter((r) => !r.synced).length} dòng
                  </p>
                </div>
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                  <span className="text-[8px] uppercase font-bold text-slate-500 tracking-wider">
                    Đã chép Sheets
                  </span>
                  <p className="text-2xl font-black text-emerald-400 mt-0.5">
                    {localRecords.filter((r) => r.synced).length} dòng
                  </p>
                </div>
              </div>

              <div className="space-y-2 pb-6">
                <h3 className="text-[9px] font-bold uppercase tracking-widest text-[#576882] pl-1 font-mono">
                  NHẬT KÝ CHI TIẾT ({localRecords.length})
                </h3>

                {localRecords.map((record) => (
                  <div
                    key={record.id}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-3"
                  >
                    <div className="w-12 h-12 bg-slate-950 border border-slate-800 rounded overflow-hidden flex-shrink-0 relative">
                      <img
                        src={record.imageData}
                        alt="record product"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                            record.synced
                              ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/40"
                              : "bg-amber-950/40 text-amber-400 border-amber-900/40"
                          }`}
                        >
                          {record.synced ? "Đã gửi Sheets" : "Lưu đệm local"}
                        </span>
                        <span className="text-[9px] text-[#576882] font-mono">
                          {record.timestamp.split(" ")[1]}
                        </span>
                      </div>

                      <h4 className="font-extrabold text-white text-xs truncate mt-1 uppercase leading-none">
                        {record.seafoodName}
                      </h4>
                      <p className="text-[8px] text-slate-400 mt-1">
                        Butcher: {record.butcherName || "Khuyết danh"}
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="bg-slate-950 px-2 py-1 rounded text-center min-w-[55px] border border-slate-850">
                        <span className="text-white font-extrabold text-xs font-mono">
                          {record.kg !== null ? `${record.kg} kg` : "--"}
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm("Bỏ dòng này?")) {
                            deleteWeighingRecord(record.id).then(loadRecords);
                          }
                        }}
                        className="text-slate-500 hover:text-red-400 mt-2 p-1"
                        title="Xóa vĩnh viễn"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    </div>
                  </div>
                ))}

                {localRecords.length === 0 && (
                  <div className="py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-900/40">
                    <Database className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                    <span className="text-xs">
                      Chưa có bản ghi nào được thu thập.
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* VIEW 6: GRAND ADMIN CONSOLE BOARD */}
          {view === "admin" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto max-w-4xl mx-auto w-full pb-10"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h2 className="text-base font-black text-white uppercase tracking-wider">
                      Bảng Điều Phối Quản Trị Viên
                    </h2>
                    <p className="text-[9px] text-[#4285F4] font-bold">
                      Email đăng nhập: {adminEmail}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end">
                  <button
                    onClick={() => setView("list")}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[9px] font-bold uppercase transition-all tracking-wider text-slate-300 flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Về butcher</span>
                  </button>
                  <button
                    onClick={handleAdminLogout}
                    className="px-3 py-1.5 bg-[#200f13] hover:bg-[#32171c] border border-red-950 text-red-400 rounded-lg text-[9px] font-bold uppercase transition-all tracking-wider flex items-center gap-1 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              </div>

              {/* TABS BUTTONS */}
              <div className="flex gap-1 border-b border-slate-850 overflow-x-auto scroller-hidden">
                <button
                  onClick={() => setAdminActiveTab("butchers")}
                  className={`px-3.5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    adminActiveTab === "butchers"
                      ? "border-indigo-500 text-indigo-400"
                      : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Quản lý butchers</span>
                </button>
                <button
                  onClick={() => setAdminActiveTab("reports")}
                  className={`px-3.5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    adminActiveTab === "reports"
                      ? "border-indigo-500 text-indigo-400"
                      : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Màn đối chiếu & Nhật ký</span>
                </button>
                <button
                  onClick={() => setAdminActiveTab("config")}
                  className={`px-3.5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    adminActiveTab === "config"
                      ? "border-indigo-500 text-indigo-400"
                      : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>Cấu hình Workspace</span>
                </button>
                <button
                  onClick={() => setAdminActiveTab("admins")}
                  className={`px-3.5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    adminActiveTab === "admins"
                      ? "border-indigo-500 text-indigo-400"
                      : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span>Ủy quyền admin</span>
                </button>
              </div>

              {/* ACTION MESSAGES RESPONSIVE */}
              {adminActionError && (
                <div className="bg-red-950/40 border border-red-900/60 text-red-400 text-[10px] font-black uppercase px-3.5 py-2 rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{adminActionError}</span>
                  <button
                    className="ml-auto"
                    onClick={() => setAdminActionError("")}
                  >
                    ✕
                  </button>
                </div>
              )}
              {adminActionSuccess && (
                <div className="bg-emerald-950/45 border border-emerald-900/60 text-emerald-400 text-[10px] font-black uppercase px-3.5 py-2 rounded-xl flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{adminActionSuccess}</span>
                  <button
                    className="ml-auto"
                    onClick={() => setAdminActionSuccess("")}
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* TAB CONTENT 1: BUTCHERS MANAGER */}
              {adminActiveTab === "butchers" && (
                <div className="space-y-4">
                  {/* Create butcher account panel */}
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col space-y-3">
                    <h3 className="text-xs font-black text-indigo-300 uppercase tracking-widest flex items-center gap-1">
                      <Plus className="w-4 h-4" />
                      <span>Cấp mới tài khoản Butcher</span>
                    </h3>

                    <form
                      onSubmit={handleCreateButcher}
                      className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
                    >
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Tên Butcher
                        </label>
                        <input
                          type="text"
                          value={newButcherName}
                          onChange={(e) => setNewButcherName(e.target.value)}
                          placeholder="Ví dụ: Nguyễn Văn A..."
                          className="w-full bg-[#05070a] border border-slate-800 rounded-lg px-3 py-2 text-base md:text-xs focus:outline-none focus:border-indigo-505 font-semibold"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Mã PIN cá nhân (4-6 số)
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const rnd = Math.floor(
                                1000 + Math.random() * 9000,
                              ).toString(); // default 4 digits random
                              setNewButcherPin(rnd);
                            }}
                            className="text-[9px] text-[#4285F4] hover:underline"
                          >
                            Tự tạo PIN
                          </button>
                        </div>
                        <input
                          type="text"
                          maxLength={6}
                          value={newButcherPin}
                          onChange={(e) =>
                            setNewButcherPin(e.target.value.replace(/\D/g, ""))
                          }
                          placeholder="Nhập 4-6 chữ số..."
                          className="w-full bg-[#05070a] border border-slate-800 rounded-lg px-3 py-2 text-base md:text-sm focus:outline-none focus:border-indigo-505 font-mono font-bold"
                        />
                      </div>

                      <button
                        type="submit"
                        className="py-2.5 bg-indigo-600 hover:bg-indigo-505 text-white text-[10px] font-bold uppercase rounded-lg shadow-md cursor-pointer transition-colors"
                      >
                        Khởi Tạo Tài Khoản
                      </button>
                    </form>
                  </div>

                  {/* Butchers List directories */}
                  <div className="space-y-2">
                    <h3 className="text-[10px] font-black uppercase text-[#576882] tracking-widest font-mono">
                      DANH SÁCH NHÂN VIÊN BUTCHER ({butchersList.length})
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {butchersList.map((bh) => (
                        <div
                          key={bh.id}
                          className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between hover:border-slate-700 transition-all"
                        >
                          <div className="space-y-1 min-w-0 pr-2">
                            <h4 className="font-extrabold text-[#f8fafc] text-sm uppercase truncate leading-none">
                              {bh.name}
                            </h4>
                            <p className="text-[9px] text-slate-500 block font-mono">
                              Ngày tạo:{" "}
                              {bh.createdAt
                                ? new Date(bh.createdAt).toLocaleDateString(
                                    "vi-VN",
                                  )
                                : "---"}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className="text-[9px] font-black text-slate-400 font-mono bg-[#05070a] px-2 py-0.5 rounded border border-slate-850">
                                PIN: {bh.pin}
                              </span>

                              <span
                                className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${
                                  bh.status === "Hoạt động"
                                    ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/40"
                                    : "bg-red-950/40 text-red-500 border-red-900/40"
                                }`}
                              >
                                {bh.status === "Hoạt động"
                                  ? "Hoạt động"
                                  : "Bị Khóa"}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            {/* Toggle Lock status */}
                            <button
                              onClick={() =>
                                handleStatusToggle(bh.id, bh.status)
                              }
                              className={`p-1.5 rounded transition-all active:scale-95 border ${
                                bh.status === "Hoạt động"
                                  ? "bg-[#180e10]/80 border-red-950 text-red-400 hover:bg-red-950/30"
                                  : "bg-[#0b1712]/80 border-emerald-950 text-emerald-400 hover:bg-emerald-950/30"
                              }`}
                              title={
                                bh.status === "Hoạt động"
                                  ? "Khóa tài khoản"
                                  : "Mở khóa tài khoản"
                              }
                            >
                              {bh.status === "Hoạt động" ? (
                                <Lock className="w-3.5 h-3.5" />
                              ) : (
                                <Unlock className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {/* Reset Pin */}
                            <button
                              onClick={() => handleResetPin(bh.id)}
                              className="p-1.5 rounded bg-slate-950 hover:bg-slate-800 text-indigo-400 border border-slate-850 transition-all active:scale-95 animate-pulse"
                              title="Tự động đặt lại PIN ngẫu nhiên"
                            >
                              <Key className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Butcher */}
                            <button
                              onClick={() =>
                                handleDeleteButcher(bh.id, bh.name)
                              }
                              className="p-1.5 rounded bg-red-950/20 hover:bg-red-950/60 text-red-400 hover:text-white transition-all active:scale-95"
                              title="Xóa tài khoản hoàn toàn"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {butchersList.length === 0 && (
                        <div className="col-span-full py-10 text-center font-bold text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-900/25">
                          <span>
                            Chưa có nhân viên butcher nào được cài đặt.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB CONTENT 2: MATCHING HISTORY & SHEET SYNCING */}
              {adminActiveTab === "reports" && (
                <div className="space-y-4">
                  {/* Google drive / sheets overall management */}
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-2">
                      <div>
                        <h3 className="text-xs font-black text-indigo-300 uppercase tracking-widest flex items-center gap-1 leading-none">
                          <FileSpreadsheet className="w-4 h-4" />
                          <span>Hệ Thống Google Sheets Sync</span>
                        </h3>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Sheets ID liên kết: {spreadsheetId || "Chưa tạo"}
                        </p>
                      </div>

                      <button
                        onClick={syncOfflineRecordsToSheets}
                        disabled={
                          syncingAll ||
                          localRecords.filter((r) => !r.synced).length === 0
                        }
                        className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 border active:scale-95 shadow ${
                          localRecords.some((r) => !r.synced)
                            ? "bg-indigo-600 border-indigo-500 text-white shadow-indigo-900/40 cursor-pointer"
                            : "bg-slate-950 border-slate-850 text-slate-500 cursor-not-allowed"
                        }`}
                      >
                        {syncingAll ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                        ) : (
                          <UploadCloud className="w-3.5 h-3.5" />
                        )}
                        <span>
                          Đồng bộ đệm Sheets (
                          {localRecords.filter((r) => !r.synced).length})
                        </span>
                      </button>
                    </div>

                    {syncProgress.total > 0 && (
                      <div className="bg-slate-950 rounded-lg p-3 border border-slate-850 space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 font-mono">
                          <span>Tiến độ truyền tải:</span>
                          <span>
                            {syncProgress.current} / {syncProgress.total} bản
                            ghi
                          </span>
                        </div>
                        <div className="w-full bg-slate-850 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${(syncProgress.current / syncProgress.total) * 100}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {syncErrorLog && (
                      <div className="bg-red-950/40 border border-[#441c22]/50 text-red-500 rounded-lg p-3 text-[10px] font-bold uppercase flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Sự cố: {syncErrorLog}</span>
                      </div>
                    )}
                  </div>

                  {/* Reports list logs display */}
                  <div className="space-y-2">
                    <h3 className="text-[10px] font-black uppercase text-[#576882] tracking-widest font-mono">
                      NHẬT KÝ SỐ CÂN ĐÃ GHI NHẬN HỆ THỐNG (
                      {adminReportsList.length})
                    </h3>

                    <div className="space-y-2">
                      {adminReportsList.map((log) => (
                        <div
                          key={log.id}
                          className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-14 h-14 bg-slate-950 border border-slate-805 rounded overflow-hidden flex-shrink-0">
                              <img
                                src={log.imageData}
                                alt="img preview"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                                    log.synced
                                      ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/40"
                                      : "bg-amber-950/40 text-amber-500 border-amber-900/40"
                                  }`}
                                >
                                  {log.synced
                                    ? "Sheets đẫ đồng bộ"
                                    : "Bản đệm Firestore"}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono italic">
                                  {log.timestamp}
                                </span>
                              </div>
                              <h4 className="font-extrabold text-white uppercase text-sm truncate mt-1">
                                {log.seafoodName}
                              </h4>
                              <p className="text-[9px] text-[#4285F4] font-bold mt-1">
                                Butcher: {log.butcherName} (PIN:{" "}
                                {log.butcherPin})
                              </p>
                              {log.driveUrl && (
                                <a
                                  href={log.driveUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[9px] text-[#576882] hover:text-blue-400 inline-flex items-center gap-1 mt-1 font-semibold"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Ảnh Drive</span>
                                </a>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 border-slate-850 pt-2 md:pt-0">
                            <div className="bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-lg text-center min-w-[70px]">
                              <span className="text-[7.5px] font-black text-slate-500 uppercase tracking-widest block font-mono">
                                Trọng lượng
                              </span>
                              <span className="text-emerald-400 font-black text-sm font-mono">
                                {log.kg !== null ? `${log.kg} kg` : "--"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}

                      {adminReportsList.length === 0 && (
                        <div className="py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-900/25">
                          <span>Chưa có lịch sử báo cáo cân hải sản nào.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB CONTENT 3: GOOGLE CONFIGS */}
              {adminActiveTab === "config" && (
                <div className="space-y-4">
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col space-y-4">
                    <div className="border-b border-slate-800 pb-2">
                      <h3 className="text-xs font-black text-indigo-300 uppercase tracking-widest">
                        Thiết lập tham số Workspace
                      </h3>
                      <p className="text-[9px] text-slate-400 mt-1">
                        Thông số này được nạp lưu trữ Firestore, tuyệt đối bảo
                        mật với Butcher.
                      </p>
                    </div>

                    <form
                      onSubmit={handleSaveConfigs}
                      className="space-y-3.5 text-xs"
                    >
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Google Client ID (OAuth V2 Credentials)
                        </label>
                        <input
                          type="text"
                          value={googleClientId}
                          onChange={(e) => setGoogleClientId(e.target.value)}
                          placeholder="Nhập client id hiển thị từ Google API console"
                          className="bg-[#05070a] border border-slate-800 rounded-lg px-3 py-2 text-base md:text-xs font-mono text-slate-350 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Google Sheets Spreadsheet ID chứa dữ liệu
                        </label>
                        <input
                          type="text"
                          value={spreadsheetId}
                          onChange={(e) => setSpreadsheetId(e.target.value)}
                          placeholder="URL hoặc ID của Sheet trang tính"
                          className="bg-[#05070a] border border-slate-800 rounded-lg px-3 py-2 text-base md:text-xs font-mono text-slate-350 focus:outline-none focus:border-indigo-500"
                        />
                        {spreadsheetId && (
                          <a
                            href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[9px] text-[#4285F4] hover:underline flex items-center gap-1 mt-1 font-bold self-start"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Mở Sheet trang dữ liệu của bạn</span>
                          </a>
                        )}
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Đường dẫn redirect URI ủy quyền
                        </label>
                        <p className="bg-slate-950 text-slate-400 border border-slate-850 rounded-lg px-3 py-2 text-[10px] font-mono whitespace-pre-wrap leading-tight">
                          {window.location.origin}/auth/callback
                        </p>
                      </div>

                      <button
                        type="submit"
                        disabled={adminSavingConfig}
                        className="py-3 bg-indigo-600 hover:bg-indigo-505 text-white font-extrabold text-[10px] uppercase rounded-lg tracking-widest transition-all w-full cursor-pointer"
                      >
                        {adminSavingConfig
                          ? "ĐANG LƯU DATA..."
                          : "CẬP NHẬT CẤU HÌNH"}
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* TAB CONTENT 4: ADMIN EMAIL PERMISSIONS */}
              {adminActiveTab === "admins" && (
                <div className="space-y-4">
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col space-y-3">
                    <h3 className="text-xs font-black text-indigo-300 uppercase tracking-widest">
                      Cấp quyền Quản Trị Viên mới
                    </h3>
                    <p className="text-[9px] text-slate-400 leading-relaxed font-bold">
                      Nhập tài khoản email của Admin mới. Mật khẩu mặc định sau
                      khi tạo mới sẽ là "admin123". Họ có thể đăng nhập bằng tài
                      khoản này ở màn khóa.
                    </p>

                    <form
                      onSubmit={handleAddAdminEmail}
                      className="flex gap-2 text-xs"
                    >
                      <input
                        type="email"
                        value={newAdminEmailInput}
                        onChange={(e) => setNewAdminEmailInput(e.target.value)}
                        placeholder="Nhập email admin mới e.g. abc@gmail.com..."
                        className="flex-1 bg-[#05070a] border border-slate-800 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 text-slate-300 font-semibold text-base md:text-xs"
                      />
                      <button
                        type="submit"
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold text-[10px] uppercase tracking-wide cursor-pointer text-white"
                      >
                        Thêm Admin
                      </button>
                    </form>
                  </div>

                  <div className="space-y-2 text-xs">
                    <h4 className="text-[10px] font-black uppercase text-[#576882] tracking-widest font-mono">
                      QUẢN TRỊ VIÊN HỆ THỐNG
                    </h4>

                    <div className="bg-slate-900 border border-slate-800 p-1.5 rounded-xl divide-y divide-slate-800">
                      {/* Super Admin standard */}
                      <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-amber-500" />
                          <div>
                            <span className="font-extrabold text-white text-xs">
                              ungchinh909@gmail.com
                            </span>
                            <span className="ml-2 bg-amber-550/15 text-amber-400 border border-amber-500/20 text-[8px] font-black uppercase px-1.5 py-0.5 rounded">
                              SUPER ADMIN
                            </span>
                          </div>
                        </div>
                        <span className="text-[9px] text-slate-500 italic">
                          Mặc định sở hữu quyền
                        </span>
                      </div>

                      {/* Display sub-admins */}
                      {adminsList
                        .filter(
                          (e) => e.toLowerCase() !== "ungchinh909@gmail.com",
                        )
                        .map((email) => (
                          <div
                            key={email}
                            className="flex items-center justify-between p-3"
                          >
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-indigo-400" />
                              <span className="font-semibold text-slate-200">
                                {email}
                              </span>
                            </div>

                            <button
                              onClick={() => handleDeleteAdminEmail(email)}
                              className="p-1.5 text-red-400 hover:text-white rounded bg-red-950/20 hover:bg-red-850 active:scale-95 transition-all text-[10px] font-bold"
                            >
                              Xóa Quyền
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* COMPACT FOOTER STATUS ROW */}
      <footer className="bg-[#0c121d] px-6 py-2 border-t border-slate-850 flex items-center justify-between text-[10px] text-slate-500">
        <div>
          <span>Bản ghi đệm offline đợi gửi: </span>
          <span className="font-bold text-amber-500 text-xs font-mono">
            {localRecords.filter((r) => !r.synced).length} dòng
          </span>
        </div>
        <span>Butcher Buffet System • v2.0-SECURE</span>
      </footer>
    </div>
  );
}
