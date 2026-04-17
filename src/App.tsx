import { useState, useEffect, Fragment } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { categories as localCategories } from "./data/links";
import { ideas as localIdeas } from "./data/ideas";
import { exploits as localExploits } from "./data/exploits";
import { 
  db, 
  auth, 
  googleProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  handleFirestoreError,
  OperationType,
  User,
  getDoc,
  getDocs
} from "./lib/firebase";
import { 
  LayoutDashboard, 
  Gamepad2, 
  Globe, 
  Layers, 
  Cpu, 
  Library, 
  Settings, 
  Lightbulb,
  Menu,
  X,
  ShieldCheck,
  ArrowLeft,
  ExternalLink,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  Plus,
  Trash2,
  History,
  Ban,
  Check,
  UserX,
  ArrowRight,
  CheckSquare,
  Square,
  Download,
  Database
} from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";
import { Badge } from "../components/ui/badge";
import { Toaster } from "../components/ui/sonner";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";

type View = "home" | "media" | "games" | "proxies" | "all-in-one" | "ai-tools" | "exploits" | "resources" | "admin" | "updates";

const COOLDOWN_2_MIN = 2 * 60 * 1000;
const COOLDOWN_6_HOURS = 6 * 60 * 60 * 1000;
const MAX_SHORT_COOLDOWNS = 3;

export default function App() {
  const [currentView, setCurrentView] = useState<View>("home");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [dbCategories, setDbCategories] = useState<any[]>([]);
  const [dbExploits, setDbExploits] = useState<any[]>([]);
  const [dbSubmissions, setDbSubmissions] = useState<any[]>([]);
  const [dbUpdateLogs, setDbUpdateLogs] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({ maintenanceMode: false, userSubmissions: true });
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadedResources, setLoadedResources] = useState(0);
  const [totalResources, setTotalResources] = useState(() => Number(localStorage.getItem("total_resources") || 0));
  const [loadingStatus, setLoadingStatus] = useState("Initializing system...");
  const [hasCache, setHasCache] = useState(false);
  const [selectedExploitId, setSelectedExploitId] = useState<string | null>(null);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [keyHoldProgress, setKeyHoldProgress] = useState(0);

  // Submission States
  const [isSubmissionModalOpen, setIsSubmissionModalOpen] = useState(false);
  const [submissionText, setSubmissionText] = useState("");
  const [linkCategories, setLinkCategories] = useState<Record<string, { category: string, isNew: boolean }>>({});
  const [isNewCategoryModalOpen, setIsNewCategoryModalOpen] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [activeLinkForNewCategory, setActiveLinkForNewCategory] = useState<string | null>(null);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedLinksForMulti, setSelectedLinksForMulti] = useState<string[]>([]);

  // Update Log States
  const [isUpdateLogModalOpen, setIsUpdateLogModalOpen] = useState(false);
  const [newUpdateLog, setNewUpdateLog] = useState("");

  // UUID for rate limiting
  const [uuid] = useState(() => {
    let id = localStorage.getItem("unblokked_uuid");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("unblokked_uuid", id);
    }
    return id;
  });

  // Admin Editor States
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [editingExploit, setEditingExploit] = useState<any>(null);
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [newLink, setNewLink] = useState({ name: "", url: "", tags: "" });

  useEffect(() => {
    // 1. Initial Cache Check
    const cachedCats = localStorage.getItem("cached_categories");
    const cachedExps = localStorage.getItem("cached_exploits");
    const cachedLogs = localStorage.getItem("cached_logs");
    
    if (cachedCats && cachedExps) {
      try {
        setDbCategories(JSON.parse(cachedCats));
        setDbExploits(JSON.parse(cachedExps));
        if (cachedLogs) setDbUpdateLogs(JSON.parse(cachedLogs));
        setHasCache(true);
        setLoadingStatus("Checking for updates...");
      } catch (e) {
        console.error("Cache corrupted, clearing...");
        localStorage.removeItem("cached_categories");
        localStorage.removeItem("cached_exploits");
      }
    } else {
      setLoadingStatus("Connecting to database...");
    }

    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      setIsSidebarOpen(!mobile);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });

    const simulateProgress = (targetCount: number, message: string) => {
      setLoadingStatus(message);
      setTotalResources(targetCount);
      localStorage.setItem("total_resources", String(targetCount));
      
      let current = 0;
      const step = Math.max(5, Math.floor(targetCount / 10)); // Much larger steps
      const interval = setInterval(() => {
        current += step + Math.floor(Math.random() * step);
        if (current >= targetCount) {
          current = targetCount;
          setLoadedResources(current);
          setLoadingProgress(100);
          clearInterval(interval);
          setTimeout(() => setIsLoading(false), 100); // Minimal delay
        } else {
          setLoadedResources(current);
          setLoadingProgress((current / targetCount) * 100);
        }
      }, 16); // 60fps-ish interval
    };

    let initialized = false;

    const qCategories = query(collection(db, "categories"), orderBy("order", "asc"));
    const unsubscribeCategories = onSnapshot(qCategories, (snapshot) => {
      const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const currentLinkCount = cats.reduce((acc, cat: any) => acc + (cat.links?.length || 0), 0);
      
      const cachedCount = Number(localStorage.getItem("total_resources") || 0);
      const isCacheEmpty = !localStorage.getItem("cached_categories");
      const hasChanges = currentLinkCount !== cachedCount;

      if (!initialized) {
        if (isCacheEmpty || hasChanges) {
          simulateProgress(currentLinkCount, isCacheEmpty ? "Downloading resources..." : "Updating resources...");
        } else {
          setIsLoading(false);
        }
        initialized = true;
      }

      setDbCategories(cats);
      localStorage.setItem("cached_categories", JSON.stringify(cats));
      localStorage.setItem("total_resources", String(currentLinkCount));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "categories");
      setIsLoading(false);
    });

    const qExploits = query(collection(db, "exploits"), orderBy("title", "asc"));
    const unsubscribeExploits = onSnapshot(qExploits, (snapshot) => {
      const exps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDbExploits(exps);
      localStorage.setItem("cached_exploits", JSON.stringify(exps));
      // Exploit changes usually don't trigger the full loader unless it's the first load
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "exploits");
    });

    const unsubscribeSettings = onSnapshot(doc(db, "settings", "global"), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data());
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "settings/global");
    });

    const qUpdateLogs = query(collection(db, "updateLogs"), orderBy("timestamp", "desc"));
    const unsubscribeUpdateLogs = onSnapshot(qUpdateLogs, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDbUpdateLogs(logs);
      localStorage.setItem("cached_logs", JSON.stringify(logs));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "updateLogs");
    });

    // Key hold logic for '6'
    let timer: any = null;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "6" && !timer) {
        let progress = 0;
        timer = setInterval(() => {
          progress += 2;
          setKeyHoldProgress(progress);
          if (progress >= 100) {
            clearInterval(timer);
            timer = null;
            setShowAdminMenu(true);
            toast.success("Admin access unlocked!");
            setKeyHoldProgress(0);
          }
        }, 100);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "6") {
        clearInterval(timer);
        timer = null;
        setKeyHoldProgress(0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      unsubscribeAuth();
      unsubscribeCategories();
      unsubscribeExploits();
      unsubscribeSettings();
      unsubscribeUpdateLogs();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  useEffect(() => {
    if (!showAdminMenu && !isAdminAuthenticated) return;

    const qSubmissions = query(collection(db, "submissions"), orderBy("createdAt", "desc"));
    const unsubscribeSubmissions = onSnapshot(qSubmissions, (snapshot) => {
      const subs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDbSubmissions(subs);
    }, (error: any) => {
      // Gracefully handle permission denied if the user is not a DB admin yet
      if (error.code === "permission-denied") return;
      
      handleFirestoreError(error, OperationType.LIST, "submissions");
    });

    return () => unsubscribeSubmissions();
  }, [showAdminMenu, isAdminAuthenticated]);

  const handleAdminAuth = () => {
    if (adminPin === "Unblokked26") {
      setIsAdminAuthenticated(true);
      toast.success("PIN verified. Please sign in with Google to continue.");
    } else {
      toast.error("Invalid PIN");
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      toast.success("Admin signed in");
    } catch (error) {
      toast.error("Login failed");
    }
  };

  const initializeData = async () => {
    try {
      const { categories: initialCategories } = await import("./data/links");
      const { exploits: initialExploits } = await import("./data/exploits");

      for (const cat of initialCategories) {
        await setDoc(doc(db, "categories", cat.id), { ...cat, order: initialCategories.indexOf(cat) });
      }
      for (const exp of initialExploits) {
        await setDoc(doc(db, "exploits", exp.id), exp);
      }
      await setDoc(doc(db, "settings", "global"), { maintenanceMode: false, userSubmissions: true });
      toast.success("Data initialized successfully");
    } catch (error) {
      toast.error("Initialization failed");
      console.error(error);
    }
  };

  const handleSubmission = async () => {
    if (!settings.userSubmissions) {
      toast.error("Submissions are currently disabled.");
      return;
    }

    // Check ban status
    try {
      const banDoc = await getDoc(doc(db, "bans", uuid));
      if (banDoc.exists()) {
        toast.error("You are banned from submitting links.");
        return;
      }
    } catch (e) {
      console.error(e);
    }

    const lastSubmissionTime = Number(localStorage.getItem("last_submission_time") || 0);
    const submissionCount = Number(localStorage.getItem("submission_count") || 0);
    const now = Date.now();

    let cooldown = COOLDOWN_2_MIN;
    if (submissionCount >= MAX_SHORT_COOLDOWNS) {
      cooldown = COOLDOWN_6_HOURS;
    }

    if (now - lastSubmissionTime < cooldown) {
      const remaining = Math.ceil((cooldown - (now - lastSubmissionTime)) / 1000 / 60);
      toast.error(`Please wait ${remaining} more minutes before submitting again.`);
      return;
    }

    if (submissionText.trim() === "") {
      toast.error("Please enter at least one link.");
      return;
    }

    const links = submissionText.split('\n').filter(line => line.trim()).map(line => {
      try {
        const url = new URL(line.trim().startsWith('http') ? line.trim() : `https://${line.trim()}`);
        return { name: url.hostname.replace('www.', ''), url: url.toString() };
      } catch {
        return { name: "Invalid Link", url: line.trim() };
      }
    });

    if (links.some(l => l.name === "Invalid Link")) {
      toast.error("Some links are invalid. Please ensure they are valid URLs.");
      return;
    }

    const activeCategories = dbCategories.length > 0 ? dbCategories : localCategories;
    
    // Group by category
    const groups: Record<string, { links: any[], isNew: boolean }> = {};
    for (const link of links) {
      const catInfo = linkCategories[link.url] || { category: activeCategories[0]?.title || "Unsorted", isNew: false };
      if (!groups[catInfo.category]) {
        groups[catInfo.category] = { links: [], isNew: catInfo.isNew };
      }
      groups[catInfo.category].links.push(link);
    }

    try {
      for (const [category, data] of Object.entries(groups)) {
        const subId = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        await setDoc(doc(db, "submissions", subId), {
          id: subId,
          uuid,
          links: data.links,
          category: category,
          isNewCategory: data.isNew,
          status: "pending",
          createdAt: new Date()
        });
      }

      localStorage.setItem("last_submission_time", String(now));
      localStorage.setItem("submission_count", String(submissionCount + 1));

      toast.success("Submissions sent for review!");
      setSubmissionText("");
      setLinkCategories({});
    } catch (error) {
      toast.error("Failed to send submissions.");
      console.error(error);
    }
  };

  const handleCreateNewCategory = () => {
    if (!newCategoryInput.trim() || !activeLinkForNewCategory) return;
    
    if (activeLinkForNewCategory === "MULTI_SELECT") {
      setLinkCategories(prev => {
        const next = { ...prev };
        selectedLinksForMulti.forEach(url => {
          next[url] = { category: newCategoryInput.trim(), isNew: true };
        });
        return next;
      });
      setIsMultiSelectMode(false);
      setSelectedLinksForMulti([]);
    } else {
      setLinkCategories(prev => ({
        ...prev,
        [activeLinkForNewCategory]: { category: newCategoryInput.trim(), isNew: true }
      }));
    }
    
    setNewCategoryInput("");
    setIsNewCategoryModalOpen(false);
    setActiveLinkForNewCategory(null);
  };

  const addUpdateLog = async (content: string, type: "auto" | "manual" = "manual") => {
    try {
      await addDoc(collection(db, "updateLogs"), {
        id: `log-${Date.now()}`,
        content,
        type,
        timestamp: new Date()
      });
    } catch (error) {
      console.error("Failed to add update log", error);
    }
  };

  const approveSubmission = async (sub: any) => {
    try {
      let targetCat = dbCategories.find(c => c.title.toLowerCase() === sub.category.toLowerCase());
      
      if (!targetCat) {
        const newCatId = sub.category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        targetCat = {
          id: newCatId,
          title: sub.category,
          links: sub.links,
          order: dbCategories.length
        };
        await setDoc(doc(db, "categories", newCatId), targetCat);
      } else {
        const updatedLinks = [...targetCat.links, ...sub.links];
        await updateDoc(doc(db, "categories", targetCat.id), { links: updatedLinks });
      }

      await updateDoc(doc(db, "submissions", sub.id), { status: "approved" });
      await addUpdateLog(`Added ${sub.links.length} new links to ${targetCat.title}`, "auto");
      toast.success("Submission approved and added!");
    } catch (error) {
      toast.error("Approval failed");
      console.error(error);
    }
  };

  const banUser = async (subUuid: string) => {
    try {
      await setDoc(doc(db, "bans", subUuid), {
        uuid: subUuid,
        bannedAt: new Date(),
        reason: "Spam / Malicious content"
      });
      toast.success("User banned successfully");
    } catch (error) {
      toast.error("Ban failed");
    }
  };

  const isFullAdmin = isAdminAuthenticated && user?.email === "antonheutz10@gmail.com";

  const navItems = [
    { id: "home", label: "Overview", icon: LayoutDashboard },
    { id: "updates", label: "Update Logs", icon: History },
    { id: "proxies", label: "Proxies", icon: Globe },
    { id: "all-in-one", label: "All-in-One", icon: Layers },
    { id: "games", label: "Games", icon: Gamepad2 },
    { id: "exploits", label: "Exploits & Cheats", icon: Zap },
    { id: "media", label: "Media", icon: Library },
    { id: "resources", label: "Resources", icon: Library },
    { id: "ai-tools", label: "AI & Tools", icon: Cpu },
    ...(showAdminMenu || isFullAdmin ? [{ id: "admin", label: "Admin Panel", icon: ShieldCheck }] : []),
  ];

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_50%_40%,rgba(16,185,129,0.05)_0%,transparent_50%)]">
          <div className="flex flex-col items-center space-y-8 w-full max-w-sm">
            <div className="relative">
              <div className="w-16 h-16 border-b-2 border-emerald-500 rounded-full animate-spin shadow-[0_0_15px_rgba(16,185,129,0.2)]" />
              <Database className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-emerald-500 animate-pulse" />
            </div>
            
            <div className="space-y-4 w-full">
              <div className="flex flex-col items-center space-y-2">
                <p className="text-zinc-100 font-bold tracking-tight text-lg">{loadingStatus}</p>
                <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">
                  <Download className="w-3 h-3 text-emerald-500" />
                  <span>Resources: {loadedResources} / {totalResources}</span>
                </div>
              </div>
              
              <div className="relative h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                <motion.div 
                  className="absolute top-0 left-0 h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${loadingProgress}%` }}
                />
              </div>
            </div>

            <div className="pt-4 flex flex-col items-center gap-2">
              <p className="text-[10px] text-zinc-600 uppercase tracking-[0.3em] font-medium">Powering premium unblocking</p>
              <div className="flex gap-1.5">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="w-1 h-1 rounded-full bg-emerald-500/20 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (settings.maintenanceMode && !isFullAdmin && currentView !== "admin") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center">
          <div className="p-6 rounded-full bg-amber-500/10">
            <Settings className="w-16 h-16 text-amber-500 animate-spin-slow" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-white">Maintenance Mode</h1>
            <p className="text-zinc-400 max-w-md mx-auto">
              unblokked is currently undergoing scheduled maintenance. We'll be back shortly with new links and improvements.
            </p>
          </div>
          <Button variant="outline" onClick={() => setCurrentView("admin")} className="border-zinc-800 text-zinc-500">
            Admin Login
          </Button>
        </div>
      );
    }

    if (currentView === "updates") {
      return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
          <div className="space-y-4">
            <h1 className="text-4xl font-black text-white tracking-tighter">Update Logs</h1>
            <p className="text-zinc-400">Track the latest changes and additions to unblokked.</p>
          </div>

          <div className="space-y-4">
            {dbUpdateLogs.map((log) => (
              <Card key={log.id} className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-6 flex items-start gap-4">
                  <div className={cn(
                    "p-2 rounded-lg shrink-0",
                    log.type === "auto" ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-500"
                  )}>
                    {log.type === "auto" ? <Zap className="w-4 h-4" /> : <History className="w-4 h-4" />}
                  </div>
                  <div className="space-y-1">
                    <p className="text-zinc-200 leading-relaxed">{log.content}</p>
                    <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">
                      {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : new Date(log.timestamp).toLocaleString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
            {dbUpdateLogs.length === 0 && (
              <div className="text-center py-12 text-zinc-500">No updates logged yet.</div>
            )}
          </div>
        </div>
      );
    }

    if (currentView === "home") {
      const activeCategories = dbCategories.length > 0 ? dbCategories : localCategories;
      const activeExploits = dbExploits.length > 0 ? dbExploits : localExploits;
      const totalLinks = activeCategories.reduce((acc, cat) => acc + (cat.links?.length || 0), 0);
      const totalExploits = activeExploits.length;

      const submissionLinks = submissionText.split('\n').filter(line => line.trim()).map(line => {
        try {
          const url = new URL(line.trim().startsWith('http') ? line.trim() : `https://${line.trim()}`);
          return { name: url.hostname.replace('www.', ''), url: url.toString() };
        } catch {
          return { name: "Invalid Link", url: line.trim() };
        }
      });

      return (
        <div className="space-y-8 animate-in fade-in duration-500">
          {isNewCategoryModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative animate-in zoom-in-95 duration-200">
                <button 
                  onClick={() => setIsNewCategoryModalOpen(false)}
                  className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                
                <h3 className="text-lg font-bold text-white mb-4">Create New Category</h3>
                
                <div className="flex items-center gap-2">
                  <Input 
                    autoFocus
                    placeholder="e.g. Math Games" 
                    value={newCategoryInput}
                    onChange={e => setNewCategoryInput(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 h-12 text-white placeholder:text-zinc-600 flex-1"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newCategoryInput.trim()) {
                        handleCreateNewCategory();
                      }
                    }}
                  />
                  <Button 
                    onClick={handleCreateNewCategory}
                    disabled={!newCategoryInput.trim()}
                    className="h-12 w-12 bg-emerald-500 hover:bg-emerald-400 text-black shrink-0 p-0 flex items-center justify-center"
                  >
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 py-1">v2.0 LIVE</Badge>
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tighter text-white leading-none">
              unblokked<span className="text-emerald-500">.</span>
            </h1>
            <p className="text-zinc-400 text-xl max-w-2xl leading-relaxed">
              The premium revamp of ByePassHub. Your ultimate web utility hub for unblocking, exploits, and tools.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm group hover:border-emerald-500/50 transition-all">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  <Globe className="w-3 h-3 text-emerald-500" />
                  Total Resources
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-black text-white group-hover:text-emerald-400 transition-colors">{totalLinks}</div>
                <p className="text-[10px] text-zinc-500 mt-1 uppercase font-bold">Verified & Working Links</p>
              </CardContent>
            </Card>
            
            <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm group hover:border-emerald-500/50 transition-all">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  <Zap className="w-3 h-3 text-emerald-500" />
                  Exploits & Cheats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-black text-white group-hover:text-emerald-400 transition-colors">{totalExploits}</div>
                <p className="text-[10px] text-zinc-500 mt-1 uppercase font-bold">Active Knowledge Base Articles</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-white">Link Request System</CardTitle>
                <CardDescription>Submit links to be added to our database. They will be reviewed by admins.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Enter Links (One per line)</label>
                      <Textarea 
                        placeholder="https://example.com&#10;https://another.com" 
                        className="bg-zinc-950 border-zinc-800 min-h-[150px] font-mono text-sm"
                        value={submissionText}
                        onChange={(e) => setSubmissionText(e.target.value)}
                      />
                    </div>
                    
                    <Button 
                      onClick={handleSubmission} 
                      className="w-full bg-emerald-500 text-black font-bold hover:bg-emerald-400 mt-auto"
                      disabled={!submissionText.trim()}
                    >
                      Submit for Review
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Preview</label>
                        {submissionLinks.length > 0 && (
                          <div className="flex items-center gap-2">
                            {isMultiSelectMode && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 text-[10px] uppercase font-bold px-2 text-zinc-400 hover:text-white"
                                onClick={() => {
                                  if (selectedLinksForMulti.length === submissionLinks.length) {
                                    setSelectedLinksForMulti([]);
                                  } else {
                                    setSelectedLinksForMulti(submissionLinks.map(l => l.url));
                                  }
                                }}
                              >
                                {selectedLinksForMulti.length === submissionLinks.length ? "Deselect All" : "Select All"}
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className={cn("h-6 text-[10px] uppercase font-bold px-2", isMultiSelectMode ? "text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 hover:text-emerald-400" : "text-zinc-500 hover:text-zinc-300")}
                              onClick={() => {
                                setIsMultiSelectMode(!isMultiSelectMode);
                                if (isMultiSelectMode) setSelectedLinksForMulti([]);
                              }}
                            >
                              Multi-Select
                            </Button>
                          </div>
                        )}
                      </div>
                      
                      {isMultiSelectMode && selectedLinksForMulti.length > 0 && (
                        <div className="flex items-center gap-2 p-2 bg-zinc-900/80 border border-zinc-800 rounded-lg mb-2">
                          <span className="text-xs text-zinc-400 font-medium px-2">{selectedLinksForMulti.length} selected</span>
                          <Select 
                            onValueChange={(val: string) => {
                              if (val === "CREATE_NEW") {
                                setActiveLinkForNewCategory("MULTI_SELECT");
                                setIsNewCategoryModalOpen(true);
                              } else {
                                const isKnownNew = Object.values(linkCategories).some(c => c.isNew && c.category === val);
                                setLinkCategories(prev => {
                                  const next = { ...prev };
                                  selectedLinksForMulti.forEach(url => {
                                    next[url] = { category: val, isNew: isKnownNew };
                                  });
                                  return next;
                                });
                                setIsMultiSelectMode(false);
                                setSelectedLinksForMulti([]);
                              }
                            }}
                          >
                            <SelectTrigger className="flex-1 h-8 text-xs bg-zinc-950 border-zinc-800">
                              <SelectValue placeholder="Apply category to selected..." />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                              <SelectItem value="CREATE_NEW" className="text-emerald-500 font-bold">
                                + Create new category
                              </SelectItem>
                              {activeCategories.map(cat => (
                                <SelectItem key={cat.id} value={cat.title}>{cat.title}</SelectItem>
                              ))}
                              {Object.values(linkCategories).filter(c => c.isNew).map(c => c.category).filter((v, i, a) => a.indexOf(v) === i).map(cat => (
                                <SelectItem key={cat} value={cat}>{cat} (New)</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <ScrollArea className="h-[280px] w-full rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                        {submissionLinks.length > 0 ? (
                          <div className="space-y-3">
                            {submissionLinks.map((link, idx) => (
                              <div key={idx} className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 flex items-center justify-between group gap-3">
                                {isMultiSelectMode && (
                                  <button 
                                    onClick={() => {
                                      setSelectedLinksForMulti(prev => 
                                        prev.includes(link.url) 
                                          ? prev.filter(u => u !== link.url)
                                          : [...prev, link.url]
                                      );
                                    }}
                                    className="shrink-0 text-zinc-500 hover:text-emerald-500 transition-colors"
                                  >
                                    {selectedLinksForMulti.includes(link.url) ? (
                                      <CheckSquare className="w-5 h-5 text-emerald-500" />
                                    ) : (
                                      <Square className="w-5 h-5" />
                                    )}
                                  </button>
                                )}
                                <div className="flex flex-col overflow-hidden flex-1">
                                  <span className="text-xs font-bold text-zinc-200 truncate">{link.name || "Untitled Link"}</span>
                                  <span className="text-[10px] text-zinc-500 truncate">{link.url}</span>
                                </div>
                                
                                <div className="flex items-center gap-2 shrink-0">
                                  <Select 
                                    value={linkCategories[link.url]?.category || activeCategories[0]?.title || ""} 
                                    onValueChange={(val: string) => {
                                      if (val === "CREATE_NEW") {
                                        setActiveLinkForNewCategory(link.url);
                                        setIsNewCategoryModalOpen(true);
                                      } else {
                                        const isKnownNew = Object.values(linkCategories).some(c => c.isNew && c.category === val);
                                        setLinkCategories(prev => ({ ...prev, [link.url]: { category: val, isNew: isKnownNew } }));
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="w-[140px] h-8 text-xs bg-zinc-950 border-zinc-800">
                                      <SelectValue placeholder="Category" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                                      <SelectItem value="CREATE_NEW" className="text-emerald-500 font-bold">
                                        + Create new category
                                      </SelectItem>
                                      {activeCategories.map(cat => (
                                        <SelectItem key={cat.id} value={cat.title}>{cat.title}</SelectItem>
                                      ))}
                                      {Object.values(linkCategories).filter(c => c.isNew).map(c => c.category).filter((v, i, a) => a.indexOf(v) === i).map(cat => (
                                        <SelectItem key={cat} value={cat}>{cat} (New)</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-zinc-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => {
                                      const nonEmptylines = submissionText.split('\n').filter(line => line.trim());
                                      nonEmptylines.splice(idx, 1);
                                      setSubmissionText(nonEmptylines.join('\n'));
                                    }}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
                            <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center">
                              <Plus className="w-5 h-5 text-zinc-700" />
                            </div>
                            <p className="text-xs text-zinc-600">Enter links on the left to see a preview here.</p>
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-white">Latest Updates</CardTitle>
                <CardDescription>Recent additions to the knowledge base.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeExploits.slice(0, 5).map(exp => (
                  <div key={exp.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/50 border border-zinc-800/50 group hover:border-emerald-500/30 transition-all">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-zinc-200 group-hover:text-emerald-400 transition-colors">{exp.title}</span>
                      <span className="text-[10px] text-zinc-500 uppercase">{exp.category}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="text-emerald-500 hover:text-emerald-400" onClick={() => {
                      setCurrentView("exploits");
                      setSelectedExploitId(exp.id);
                    }}>Read</Button>
                  </div>
                ))}
                <Button 
                  variant="outline" 
                  className="w-full border-zinc-800 text-zinc-500 hover:text-white"
                  onClick={() => setCurrentView("exploits")}
                >
                  View All Exploits
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    if (currentView === "admin") {
      if (!isFullAdmin) {
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-in fade-in duration-500">
            <div className="p-8 rounded-3xl bg-zinc-900/50 border border-zinc-800 w-full max-w-md space-y-6">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck className="w-8 h-8 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-black text-white">Admin Authentication</h2>
                <p className="text-zinc-500 text-sm">Enter the master PIN to access the control panel.</p>
              </div>
              
              {!isAdminAuthenticated ? (
                <div className="space-y-4">
                  <Input
                    type="password"
                    placeholder="Enter PIN"
                    className="h-12 bg-zinc-950 border-zinc-800 text-center text-xl tracking-[0.5em] font-mono"
                    value={adminPin}
                    onChange={(e) => setAdminPin(e.target.value)}
                  />
                  <Button className="w-full h-12 bg-white text-black font-bold hover:bg-zinc-200" onClick={handleAdminAuth}>
                    Verify PIN
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                    <p className="text-emerald-500 font-bold text-sm">PIN Verified Successfully</p>
                  </div>
                  <Button className="w-full h-12 bg-white text-black font-bold hover:bg-zinc-200 flex items-center justify-center gap-2" onClick={handleGoogleLogin}>
                    <Globe className="w-4 h-4" /> Sign in with Google
                  </Button>
                </div>
              )}
            </div>
            <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-bold">Unauthorized access is strictly prohibited</p>
          </div>
        );
      }

      return (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-black text-white">Admin Control Panel</h1>
              <p className="text-zinc-500">Manage links, exploits, and system settings.</p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" className="border-zinc-800" onClick={initializeData}>
                Reset to Defaults
              </Button>
              <Button variant="outline" className="border-zinc-800 text-red-500 hover:bg-red-500/10" onClick={() => auth.signOut()}>
                Logout
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 bg-zinc-900 border-zinc-800">
              <h3 className="text-lg font-semibold text-zinc-400 mb-2">Total Links</h3>
              <p className="text-4xl font-bold text-emerald-500">{dbCategories.reduce((acc, cat) => acc + (cat.links?.length || 0), 0)}</p>
            </Card>
            <Card className="p-6 bg-zinc-900 border-zinc-800">
              <h3 className="text-lg font-semibold text-zinc-400 mb-2">Categories</h3>
              <p className="text-4xl font-bold text-blue-500">{dbCategories.length}</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              {/* Submission Review */}
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-lg font-bold">Pending Submissions</CardTitle>
                  <CardDescription>Review and approve user-submitted links.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {dbSubmissions.filter(s => s.status === "pending").map(sub => (
                    <div key={sub.id} className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white">{sub.category} {sub.isNewCategory && <Badge className="ml-2 bg-blue-500/10 text-blue-500 border-blue-500/20">NEW</Badge>}</span>
                          <span className="text-[10px] text-zinc-500 font-mono">UUID: {sub.uuid.slice(0, 8)}...</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" className="bg-emerald-500 text-black" onClick={() => approveSubmission(sub)}>
                            <Check className="w-4 h-4 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" className="border-zinc-800 text-red-500" onClick={() => updateDoc(doc(db, "submissions", sub.id), { status: "rejected" })}>
                            <X className="w-4 h-4 mr-1" /> Reject
                          </Button>
                          <Button size="sm" variant="ghost" className="text-zinc-600 hover:text-red-500" onClick={() => banUser(sub.uuid)}>
                            <UserX className="w-4 h-4 mr-1" /> Ban
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {sub.links.map((link: any, idx: number) => (
                          <div key={idx} className="p-2 rounded bg-zinc-900 border border-zinc-800/50 flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-zinc-300">{link.name}</span>
                              <span className="text-[10px] text-zinc-500 truncate max-w-[300px]">{link.url}</span>
                            </div>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => window.open(link.url, "_blank")}>
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {dbSubmissions.filter(s => s.status === "pending").length === 0 && (
                    <div className="text-center py-8 text-zinc-600">No pending submissions.</div>
                  )}
                </CardContent>
              </Card>

              {/* Category & Link Editor */}
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold">Link Management</CardTitle>
                    <CardDescription>Edit categories and their associated links.</CardDescription>
                  </div>
                  <Button size="sm" className="bg-emerald-500 text-black font-bold" onClick={() => {
                    const id = prompt("Category ID (e.g., proxies):");
                    const title = prompt("Category Title:");
                    if (id && title) {
                      setDoc(doc(db, "categories", id), { id, title, links: [], order: dbCategories.length });
                    }
                  }}>Add Category</Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {dbCategories.map(cat => (
                    <div key={cat.id} className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-white">{cat.title}</span>
                          <Badge variant="outline" className="text-[8px] uppercase">{cat.links.length} Links</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="ghost" className="h-8 text-emerald-500" onClick={() => {
                            setEditingCategory(cat);
                            setIsAddingLink(true);
                          }}>Add Link</Button>
                          <Button size="sm" variant="ghost" className="h-8 text-red-500" onClick={() => deleteDoc(doc(db, "categories", cat.id))}>Delete</Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {cat.links.map((link: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-2 rounded bg-zinc-900 border border-zinc-800/50 group">
                            <div className="flex flex-col">
                              <span className="text-xs font-medium text-zinc-300">{link.name}</span>
                              <span className="text-[9px] text-zinc-600 truncate max-w-[150px]">{link.url}</span>
                            </div>
                            <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-red-500" onClick={() => {
                              const newLinks = [...cat.links];
                              newLinks.splice(idx, 1);
                              updateDoc(doc(db, "categories", cat.id), { links: newLinks });
                            }}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Exploit Editor */}
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold">Exploit Editor</CardTitle>
                    <CardDescription>Create and edit knowledge base articles.</CardDescription>
                  </div>
                  <Button size="sm" className="bg-emerald-500 text-black font-bold" onClick={() => {
                    setEditingExploit({
                      id: `exp-${Date.now()}`,
                      title: "New Exploit",
                      category: "Bookmarklets",
                      summary: "Short summary...",
                      content: "# New Article\n\nStart writing here...",
                      updatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                      tags: []
                    });
                  }}>New Article</Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {dbExploits.map(exp => (
                    <div key={exp.id} className="flex items-center justify-between p-4 rounded-xl bg-zinc-950 border border-zinc-800">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white">{exp.title}</span>
                        <span className="text-[10px] text-zinc-500 uppercase">{exp.category}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" className="h-8 text-emerald-500" onClick={() => setEditingExploit(exp)}>Edit</Button>
                        <Button size="sm" variant="ghost" className="h-8 text-red-500" onClick={() => deleteDoc(doc(db, "exploits", exp.id))}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-8">
              {/* System Settings */}
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg font-bold">System Settings</CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="border-zinc-800 gap-2"
                    onClick={() => setIsUpdateLogModalOpen(true)}
                  >
                    <Plus className="w-4 h-4" /> Add Update Log
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-950 border border-zinc-800">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white">Maintenance Mode</span>
                        <span className="text-[10px] text-zinc-500">Lock site for non-admins</span>
                      </div>
                      <Button 
                        variant={settings.maintenanceMode ? "default" : "outline"}
                        size="sm"
                        className={settings.maintenanceMode ? "bg-red-500 hover:bg-red-600" : "border-zinc-800"}
                        onClick={() => updateDoc(doc(db, "settings", "global"), { maintenanceMode: !settings.maintenanceMode })}
                      >
                        {settings.maintenanceMode ? "ACTIVE" : "INACTIVE"}
                      </Button>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-950 border border-zinc-800">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white">User Submissions</span>
                        <span className="text-[10px] text-zinc-500">Allow link suggestions</span>
                      </div>
                      <Button 
                        variant={settings.userSubmissions ? "default" : "outline"}
                        size="sm"
                        className={settings.userSubmissions ? "bg-emerald-500 text-black hover:bg-emerald-600" : "border-zinc-800"}
                        onClick={() => updateDoc(doc(db, "settings", "global"), { userSubmissions: !settings.userSubmissions })}
                      >
                        {settings.userSubmissions ? "ENABLED" : "DISABLED"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Add Update Log Modal */}
          <Dialog open={isUpdateLogModalOpen} onOpenChange={setIsUpdateLogModalOpen}>
            <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
              <DialogHeader>
                <DialogTitle>Add Manual Update Log</DialogTitle>
                <DialogDescription>Describe the changes you've made to the site.</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Textarea 
                  placeholder="What's new? (e.g., Added 5 new games, fixed proxy issues...)"
                  value={newUpdateLog}
                  onChange={e => setNewUpdateLog(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 min-h-[120px]"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsUpdateLogModalOpen(false)} className="border-zinc-800">Cancel</Button>
                <Button 
                  className="bg-emerald-500 text-black font-bold"
                  onClick={async () => {
                    if (!newUpdateLog) return;
                    await addUpdateLog(newUpdateLog, "manual");
                    setNewUpdateLog("");
                    setIsUpdateLogModalOpen(false);
                    toast.success("Update log added");
                  }}
                >
                  Post Update
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Exploit Modal */}
          {editingExploit && (
            <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <Card className="bg-zinc-900 border-zinc-800 w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between border-b border-zinc-800">
                  <CardTitle>Edit Article: {editingExploit.title}</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => setEditingExploit(null)}><X /></Button>
                </CardHeader>
                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                  <div className="flex-1 p-6 space-y-4 overflow-y-auto border-r border-zinc-800">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase">Title</label>
                        <Input value={editingExploit.title} onChange={e => setEditingExploit({...editingExploit, title: e.target.value})} className="bg-zinc-950 border-zinc-800" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase">Category</label>
                        <Input value={editingExploit.category} onChange={e => setEditingExploit({...editingExploit, category: e.target.value})} className="bg-zinc-950 border-zinc-800" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Summary</label>
                      <Input value={editingExploit.summary} onChange={e => setEditingExploit({...editingExploit, summary: e.target.value})} className="bg-zinc-950 border-zinc-800" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Bookmarklet (Optional)</label>
                      <Input value={editingExploit.bookmarklet || ""} onChange={e => setEditingExploit({...editingExploit, bookmarklet: e.target.value})} className="bg-zinc-950 border-zinc-800" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Tags (comma separated)</label>
                      <Input value={editingExploit.tags?.join(", ") || ""} onChange={e => setEditingExploit({...editingExploit, tags: e.target.value.split(",").map(t => t.trim())})} className="bg-zinc-950 border-zinc-800" />
                    </div>
                    <div className="space-y-2 flex-1 flex flex-col">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Content (Markdown)</label>
                      <textarea 
                        className="flex-1 w-full bg-zinc-950 border border-zinc-800 rounded-md p-4 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 min-h-[300px]"
                        value={editingExploit.content}
                        onChange={e => setEditingExploit({...editingExploit, content: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="flex-1 p-6 bg-zinc-950 overflow-y-auto">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase mb-4 block">Preview</label>
                    <div className="prose prose-invert prose-zinc max-w-none prose-headings:font-black prose-headings:tracking-tight prose-a:text-emerald-500 prose-code:text-emerald-400 prose-code:bg-emerald-500/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {editingExploit.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
                <CardHeader className="border-t border-zinc-800 flex flex-row justify-end gap-3">
                  <Button variant="outline" onClick={() => setEditingExploit(null)}>Cancel</Button>
                  <Button className="bg-emerald-500 text-black font-bold" onClick={async () => {
                    await setDoc(doc(db, "exploits", editingExploit.id), editingExploit);
                    setEditingExploit(null);
                    toast.success("Article saved");
                  }}>Save Article</Button>
                </CardHeader>
              </Card>
            </div>
          )}

          {/* Add Link Modal */}
          {isAddingLink && (
            <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <Card className="bg-zinc-900 border-zinc-800 w-full max-w-md">
                <CardHeader>
                  <CardTitle>Add Link to {editingCategory.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Name</label>
                    <Input value={newLink.name} onChange={e => setNewLink({...newLink, name: e.target.value})} className="bg-zinc-950 border-zinc-800" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">URL</label>
                    <Input value={newLink.url} onChange={e => setNewLink({...newLink, url: e.target.value})} className="bg-zinc-950 border-zinc-800" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Tags (comma separated)</label>
                    <Input value={newLink.tags} onChange={e => setNewLink({...newLink, tags: e.target.value})} className="bg-zinc-950 border-zinc-800" />
                  </div>
                </CardContent>
                <CardHeader className="flex flex-row justify-end gap-3">
                  <Button variant="outline" onClick={() => setIsAddingLink(false)}>Cancel</Button>
                  <Button className="bg-emerald-500 text-black font-bold" onClick={async () => {
                    const linkObj = { 
                      name: newLink.name, 
                      url: newLink.url, 
                      tags: newLink.tags ? newLink.tags.split(",").map(t => t.trim()) : undefined 
                    };
                    const updatedLinks = [...editingCategory.links, linkObj];
                    await updateDoc(doc(db, "categories", editingCategory.id), { links: updatedLinks });
                    setIsAddingLink(false);
                    setNewLink({ name: "", url: "", tags: "" });
                    toast.success("Link added");
                  }}>Add Link</Button>
                </CardHeader>
              </Card>
            </div>
          )}
        </div>
      );
    }

    if (currentView === "exploits") {
      const activeExploits = dbExploits.length > 0 ? dbExploits : localExploits;
      const filteredExploits = activeExploits.filter(exp => 
        exp.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exp.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exp.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exp.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exp.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      );

      if (selectedExploitId) {
        const exploit = activeExploits.find(e => e.id === selectedExploitId);
        if (exploit) {
          return (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
              <Button 
                variant="ghost" 
                className="text-zinc-500 hover:text-white gap-2 px-0"
                onClick={() => setSelectedExploitId(null)}
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Knowledge Base
              </Button>

              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-xs font-mono text-zinc-500">
                    <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/20 text-emerald-500 uppercase tracking-widest">
                      {exploit.category}
                    </Badge>
                    <span>Updated {exploit.updatedAt}</span>
                  </div>
                  <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-tight">
                    {exploit.title}
                  </h1>
                  {exploit.tags && (
                    <div className="flex flex-wrap gap-2">
                      {exploit.tags.map(tag => (
                        <span key={tag} className="text-[10px] px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold uppercase tracking-wider">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {exploit.bookmarklet && (
                  <div className="p-8 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl space-y-4 text-center">
                    <div className="space-y-2">
                      <h3 className="text-emerald-500 font-bold uppercase tracking-widest text-xs">Interactive Bookmarklet</h3>
                      <p className="text-zinc-400 text-sm">Drag the button below to your bookmarks bar to save this exploit.</p>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <a 
                        href={exploit.bookmarklet}
                        className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-500 text-black font-black rounded-xl hover:bg-emerald-400 transition-all cursor-move shadow-[0_0_30px_rgba(16,185,129,0.2)] group"
                        onClick={(e) => e.preventDefault()}
                      >
                        <Zap className="w-5 h-5 fill-current" />
                        {exploit.title}
                      </a>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(exploit.bookmarklet!);
                          toast.success("Javascript copied to clipboard");
                        }}
                        className="text-xs text-zinc-500 underline hover:text-zinc-300 transition-colors"
                      >
                        or copy the javascript
                      </button>
                    </div>
                  </div>
                )}

                <Separator className="bg-zinc-900" />

                <div className="prose prose-invert prose-zinc max-w-none 
                  prose-headings:text-white prose-headings:font-bold prose-headings:tracking-tight
                  prose-h3:text-2xl prose-h3:mt-12 prose-h3:mb-6 prose-h3:text-emerald-400
                  prose-p:text-zinc-400 prose-p:text-lg prose-p:leading-relaxed
                  prose-strong:text-zinc-100 prose-strong:font-bold
                  prose-code:text-emerald-400 prose-code:bg-emerald-500/10 prose-code:px-2 prose-code:py-0.5 prose-code:rounded-md prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                  prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800 prose-pre:rounded-2xl prose-pre:p-6 prose-pre:shadow-2xl
                  prose-li:text-zinc-400 prose-li:text-lg prose-li:marker:text-emerald-500
                  prose-hr:border-zinc-900 prose-hr:my-12
                  prose-a:text-emerald-500 prose-a:font-medium prose-a:no-underline hover:prose-a:underline transition-all
                  prose-blockquote:border-l-4 prose-blockquote:border-emerald-500 prose-blockquote:bg-emerald-500/5 prose-blockquote:py-4 prose-blockquote:px-8 prose-blockquote:rounded-r-2xl prose-blockquote:italic
                  prose-img:rounded-2xl prose-img:border prose-img:border-zinc-800
                ">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '');
                        if (!inline && match) {
                          return (
                            <div className="relative group/code my-6">
                              <div className="absolute right-4 top-4 opacity-0 group-hover/code:opacity-100 transition-opacity">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 bg-zinc-900/80 border-zinc-700 text-zinc-400 hover:text-white"
                                  onClick={() => {
                                    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
                                    toast.success("Code copied to clipboard");
                                  }}
                                >
                                  Copy
                                </Button>
                              </div>
                              <pre className={cn("overflow-x-auto p-6 rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl font-mono text-sm leading-relaxed", className)}>
                                <code {...props}>
                                  {children}
                                </code>
                              </pre>
                            </div>
                          );
                        }
                        return (
                          <code className={cn("bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-mono text-sm", className)} {...props}>
                            {children}
                          </code>
                        );
                      }
                    }}
                  >
                    {exploit.content}
                  </ReactMarkdown>
                </div>
              </div>

              <div className="pt-12 border-t border-zinc-900 flex justify-between items-center">
                <Button 
                  variant="outline" 
                  className="border-zinc-800 text-zinc-400 hover:text-white"
                  onClick={() => setSelectedExploitId(null)}
                >
                  Return to List
                </Button>
                <p className="text-zinc-600 text-xs font-mono uppercase tracking-widest">
                  End of Article
                </p>
              </div>
            </div>
          );
        }
      }

      return (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
          <div className="space-y-6 text-center">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold tracking-widest uppercase">
                Knowledge Base
              </div>
              <h1 className="text-5xl md:text-6xl font-black text-white tracking-tighter">Exploits & Bypasses</h1>
              <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                A curated collection of browser exploits and system tweaks. 
                Click an article to view full instructions.
              </p>
            </div>

            <div className="relative w-full max-w-md mx-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input 
                placeholder="Search knowledge base..." 
                className="pl-10 bg-zinc-900 border-zinc-800 text-white focus-visible:ring-zinc-700 h-12 rounded-xl"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {["All", ...new Set(activeExploits.map(e => e.category))].map(cat => (
                <Button
                  key={cat}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "text-[10px] font-bold tracking-widest uppercase px-4 py-1.5 h-auto rounded-full border transition-all",
                    (searchQuery.toLowerCase() === cat.toLowerCase() || (cat === "All" && searchQuery === ""))
                      ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500"
                      : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                  )}
                  onClick={() => setSearchQuery(cat === "All" ? "" : cat)}
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredExploits.map((exploit) => (
              <Card 
                key={exploit.id} 
                className="bg-zinc-900/40 border-zinc-800 hover:border-emerald-500/40 hover:bg-zinc-800/40 transition-all group cursor-pointer overflow-hidden flex flex-col"
                onClick={() => {
                  setSelectedExploitId(exploit.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <CardHeader className="p-6 space-y-3 flex-1">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px] font-bold text-zinc-500 border-zinc-800 uppercase tracking-wider">
                      {exploit.category}
                    </Badge>
                    <span className="text-[10px] font-mono text-zinc-600 uppercase">
                      {exploit.updatedAt}
                    </span>
                  </div>
                  <CardTitle className="text-xl font-bold text-zinc-100 group-hover:text-white transition-colors leading-tight">
                    {exploit.title}
                  </CardTitle>
                  {exploit.tags && (
                    <div className="flex flex-wrap gap-1.5">
                      {exploit.tags.map(tag => (
                        <span key={tag} className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 font-bold uppercase tracking-wider">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-sm text-zinc-400 leading-relaxed line-clamp-3">
                    {exploit.summary}
                  </p>
                </CardHeader>
                <CardContent className="p-6 pt-0 flex items-center justify-between border-t border-zinc-800/50 bg-zinc-950/20">
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest group-hover:translate-x-1 transition-transform inline-flex items-center gap-2">
                    Read Full Article <Zap className="w-3 h-3" />
                  </span>
                </CardContent>
              </Card>
            ))}
            {filteredExploits.length === 0 && (
              <div className="col-span-full py-20 text-center space-y-4">
                <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto border border-zinc-800">
                  <Search className="w-8 h-8 text-zinc-700" />
                </div>
                <div className="space-y-1">
                  <p className="text-white font-bold text-xl">No exploits found</p>
                  <p className="text-zinc-500">Try adjusting your search terms or category.</p>
                </div>
              </div>
            )}
          </div>

          <div className="pt-12 border-t border-zinc-900 text-center">
            <p className="text-zinc-500 text-sm">
              End of knowledge base. Check back later for more updates.
            </p>
          </div>
        </div>
      );
    }

    const category = dbCategories.find(c => c.id === currentView) || localCategories.find(c => c.id === currentView);
    if (!category) return null;

    const filteredLinks = category.links.filter(link => 
      (link.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.url.toLowerCase().includes(searchQuery.toLowerCase())) &&
      !link.name.toLowerCase().includes("unsorted proxies") &&
      !link.name.toLowerCase().includes("unsorted games")
    );

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-white">{category.title}</h1>
            <p className="text-zinc-400">{category.description}</p>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input 
              placeholder="Search links..." 
              className="pl-10 bg-zinc-900 border-zinc-800 text-white focus-visible:ring-zinc-700"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {category.status && (
            <div className="col-span-full mb-4">
              <div className="flex items-center gap-4">
                <div className="h-px bg-gradient-to-r from-blue-500/50 to-transparent w-12" />
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Category Status</span>
                  <Badge variant="outline" className="bg-zinc-900 border-zinc-800 text-zinc-100 font-bold px-3 py-1">
                    {category.status}
                  </Badge>
                </div>
                <div className="h-px bg-zinc-800 flex-1" />
              </div>
            </div>
          )}

          {filteredLinks.map((link, idx) => {
            const currentPrefix = link.name.includes(" (") ? link.name.split(" (")[0] : link.name;
            const prevPrefix = idx > 0 ? (filteredLinks[idx - 1].name.includes(" (") ? filteredLinks[idx - 1].name.split(" (")[0] : filteredLinks[idx - 1].name) : null;
            const isNewSection = currentPrefix !== prevPrefix;

            return (
              <Fragment key={idx}>
                {isNewSection && (
                  <div className="col-span-full mt-12 mb-6 first:mt-0">
                    <div className="flex items-center gap-4">
                      <div className="h-px bg-gradient-to-r from-emerald-500/50 to-transparent w-12" />
                      <h2 className="text-xl font-bold text-white tracking-tight">{currentPrefix}</h2>
                      <div className="h-px bg-zinc-800 flex-1" />
                    </div>
                  </div>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-20px" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="h-full"
                >
                  <Card className="bg-zinc-900/50 border-zinc-800 hover:border-emerald-500/30 hover:bg-zinc-800/50 transition-all group overflow-hidden h-full backdrop-blur-sm">
                    <CardHeader className="p-5 flex flex-row items-center justify-between space-y-0">
                      <div className="space-y-1.5">
                        <CardTitle className="text-sm font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors">
                          {link.name}
                        </CardTitle>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                            <p className="text-[10px] text-zinc-500 truncate max-w-[160px] font-mono tracking-wider uppercase">
                              {link.url.startsWith("http") ? new URL(link.url).hostname.replace("www.", "") : "Resource"}
                            </p>
                          </div>
                          {link.tags && (
                            <div className="flex flex-wrap gap-1">
                              {link.tags.map(tag => (
                                <span key={tag} className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/5 border border-emerald-500/10 text-emerald-500/70 uppercase tracking-tighter font-bold">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-9 w-9 text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-full transition-all"
                        onClick={() => window.open(link.url, "_blank")}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </CardHeader>
                  </Card>
                </motion.div>
              </Fragment>
            );
          })}
          {filteredLinks.length === 0 && (
            <div className="col-span-full py-12 text-center space-y-2">
              <Search className="w-12 h-12 text-zinc-800 mx-auto" />
              <p className="text-zinc-500">No links found matching your search.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-white selection:text-black">
      <Toaster position="top-right" theme="dark" />
      
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 border-b border-zinc-900 bg-black/80 backdrop-blur-md sticky top-0 z-50">
        <div 
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => {
            setCurrentView("home");
            setSearchQuery("");
            setSelectedExploitId(null);
            setIsSidebarOpen(false);
          }}
        >
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <span className="text-black font-bold text-xl">u</span>
          </div>
          <span className="font-bold text-xl tracking-tight">unblokked</span>
        </div>
        <Button variant="ghost" size="icon" className="text-zinc-400" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
          {isSidebarOpen ? <X /> : <Menu />}
        </Button>
      </div>

      <div className="flex h-screen overflow-hidden relative">
        {/* Mobile Backdrop */}
        <AnimatePresence>
          {isSidebarOpen && isMobile && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-30 lg:hidden"
            />
          )}
        </AnimatePresence>
        {/* Admin Access Progress Bar */}
        {keyHoldProgress > 0 && (
          <div className="fixed top-0 left-0 right-0 h-1 bg-zinc-900 z-[100]">
            <motion.div 
              className="h-full bg-emerald-500" 
              initial={{ width: 0 }}
              animate={{ width: `${keyHoldProgress}%` }}
            />
          </div>
        )}

        {/* Sidebar */}
        <AnimatePresence mode="wait">
          {isSidebarOpen && (
            <motion.aside
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              className={cn(
                "fixed inset-y-0 left-0 z-40 w-64 bg-zinc-950 border-r border-zinc-900 lg:relative lg:translate-x-0 transition-all duration-300 ease-in-out flex flex-col",
                !isSidebarOpen && "lg:w-0 lg:border-none"
              )}
            >
              <div 
                className="p-6 hidden lg:flex items-center gap-3 cursor-pointer group/logo"
                onClick={() => {
                  setCurrentView("home");
                  setSearchQuery("");
                  setSelectedExploitId(null);
                }}
              >
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.1)] group-hover/logo:scale-105 transition-transform">
                  <span className="text-black font-black text-2xl">u</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-xl tracking-tighter leading-none group-hover/logo:text-emerald-500 transition-colors">unblokked</span>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mt-1">Revamp v2.0</span>
                </div>
              </div>

              <ScrollArea className="flex-1 px-4">
                <div className="space-y-1 py-2">
                  {navItems.map((item) => (
                    <Button
                      key={item.id}
                      variant="ghost"
                      className={cn(
                        "w-full justify-start gap-3 px-3 py-6 text-zinc-400 hover:text-white hover:bg-zinc-900/50 transition-all group",
                        currentView === item.id && "bg-zinc-900 text-white shadow-sm"
                      )}
                      onClick={() => {
                        setCurrentView(item.id as View);
                        setSearchQuery("");
                        setSelectedExploitId(null);
                        if (window.innerWidth < 1024) setIsSidebarOpen(false);
                      }}
                    >
                      <item.icon className={cn(
                        "w-5 h-5 transition-colors",
                        currentView === item.id ? "text-white" : "text-zinc-500 group-hover:text-zinc-300"
                      )} />
                      <span className="font-medium">{item.label}</span>
                      {currentView === item.id && (
                        <motion.div 
                          layoutId="active-pill"
                          className="ml-auto w-1 h-5 bg-white rounded-full"
                        />
                      )}
                    </Button>
                  ))}
                </div>
              </ScrollArea>

              <div className="p-4 border-t border-zinc-900">
                <div className="bg-zinc-900/50 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] text-zinc-600 leading-relaxed">
                    unblokked is a community-driven project. Use responsibly.
                  </p>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-black relative overflow-x-hidden">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-white/5 blur-[100px] rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none" />
          
          <div className="max-w-6xl mx-auto p-6 lg:p-12 relative z-10 min-h-[calc(100vh-200px)]">
            {renderContent()}
          </div>

          <footer className="mt-auto py-12 border-t border-zinc-900 relative z-10">
            <div className="max-w-6xl mx-auto px-6 flex flex-col items-center gap-6 text-center">
              <div className="flex flex-col items-center gap-2">
                <button 
                  onClick={() => setCurrentView("updates")}
                  className="text-zinc-600 hover:text-zinc-400 text-xs font-medium transition-colors underline underline-offset-4"
                >
                  Update Logs
                </button>
                <p className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-bold">
                  Use Responsibly • unblokked © 2024
                </p>
              </div>
              <div className="flex gap-8">
                <a href="#" className="text-zinc-700 hover:text-emerald-500 transition-colors">
                  <Globe className="w-4 h-4" />
                </a>
                <a href="#" className="text-zinc-700 hover:text-emerald-500 transition-colors">
                  <Gamepad2 className="w-4 h-4" />
                </a>
                <a href="#" className="text-zinc-700 hover:text-emerald-500 transition-colors">
                  <Zap className="w-4 h-4" />
                </a>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
