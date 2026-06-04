import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import "./index.css";

const ROOM_ID = "demo-room";
const WS_URL = `ws://127.0.0.1:8000/ws/rooms/${ROOM_ID}`;
const API_URL = "http://127.0.0.1:8000";

function App() {
  const [messages, setMessages] = useState([]);
  const [cases, setCases] = useState([]);
  const [username, setUsername] = useState("alin");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("Moderator");
  const [authMode, setAuthMode] = useState("login");
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState("");
  const ws = useRef(null);
  const [activePage, setActivePage] = useState("Dashboard");

  const loadCases = async () => {
    try {
      const response = await fetch(`${API_URL}/rooms/${ROOM_ID}/cases`);
      const result = await response.json();
      setCases(result);
    } catch (error) {
      console.error("Failed to load cases:", error);
    }
  };

  const loadMessages = async () => {
    try {
      const response = await fetch(`${API_URL}/rooms/${ROOM_ID}/messages`);
      const result = await response.json();
      setMessages(result);
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  };

useEffect(() => {
  if (!user) return;

  const initializeDashboard = async () => {
    await loadCases();
    await loadMessages();

    ws.current = new WebSocket(WS_URL);

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "chat_message") {
        setMessages((prev) => [data, ...prev]);
      }

      if (data.type === "moderation_action") {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === data.message.id ? data.message : msg))
        );
      }

      if (data.type === "system") {
        alert(data.message);
      }
    };
  };

  initializeDashboard();

  return () => {
    if (ws.current) {
      ws.current.close();
    }
  };
}, [user]);

  const handleAuth = async () => {
    setAuthError("");

    const endpoint = authMode === "login" ? "login" : "register";

    const body =
      authMode === "login"
        ? { username, password }
        : { username, password, role };

    const response = await fetch(`${API_URL}/auth/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (!result.success) {
      setAuthError(result.error || "Authentication failed");
      return;
    }

    if (result.token) {
      localStorage.setItem("liveguard_token", result.token);
    }

    setUser({
      username: result.username,
      role: result.role,
    });

    setUsername(result.username);
    setRole(result.role);
  };

  const logout = () => {
    localStorage.removeItem("liveguard_token");
    setUser(null);
    setMessages([]);
    setCases([]);
  };

  const sendMessage = () => {
    if (!message.trim()) return;
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;

    ws.current.send(
      JSON.stringify({
        username: user.username,
        message,
      })
    );

    setMessage("");
  };

  const createCase = async (id) => {
    try {
      const response = await fetch(`${API_URL}/rooms/${ROOM_ID}/cases/${id}`, {
        method: "POST",
      });

      const result = await response.json();

      if (result.success) {
        setCases((prev) => {
          const exists = prev.some((c) => c.case_id === result.case.case_id);
          if (exists) return prev;
          return [result.case, ...prev];
        });
      }
    } catch (error) {
      console.error("Failed to create case:", error);
    }
  };

  const updateCaseStatus = async (caseId, status) => {
    try {
      const response = await fetch(
        `${API_URL}/rooms/${ROOM_ID}/cases/${caseId}/${status}`,
        {
          method: "PATCH",
        }
      );

      const result = await response.json();

      if (result.success) {
        setCases((prev) =>
          prev.map((c) => (c.case_id === caseId ? result.case : c))
        );
      }
    } catch (error) {
      console.error("Failed to update case status:", error);
    }
  };

  const takeAction = async (id, action) => {
    try {
      const response = await fetch(
        `${API_URL}/rooms/${ROOM_ID}/action/${id}/${action}`,
        {
          method: "POST",
        }
      );

      const result = await response.json();

      if (result.success) {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === id ? result.message : msg))
        );
      }
    } catch (error) {
      console.error("Failed to take action:", error);
    }
  };

  const flaggedMessages = messages.filter((m) => m.is_flagged);
  const safeMessages = messages.filter((m) => m.severity === "safe");
  const highRiskMessages = messages.filter((m) => m.severity === "high");
  const mediumRiskMessages = messages.filter((m) => m.severity === "medium");
  const lowRiskMessages = messages.filter((m) => m.severity === "low");

  const safetyScore =
    messages.length === 0
      ? 100
      : Math.max(
          0,
          Math.round(100 - (flaggedMessages.length / messages.length) * 100)
        );

  const severityChartData = [
    { name: "Safe", value: safeMessages.length },
    { name: "Low", value: lowRiskMessages.length },
    { name: "Medium", value: mediumRiskMessages.length },
    { name: "High", value: highRiskMessages.length },
  ];

  const categoryCounts = messages.reduce((acc, msg) => {
    acc[msg.category] = (acc[msg.category] || 0) + 1;
    return acc;
  }, {});

  const categoryChartData = Object.entries(categoryCounts).map(
    ([name, value]) => ({
      name,
      value,
    })
  );

  const activityFeed = messages
    .filter((msg) => msg.is_flagged || msg.action_taken !== "none")
    .slice(0, 8);

  const userStats = messages.reduce((acc, msg) => {
    if (!acc[msg.username]) {
      acc[msg.username] = {
        username: msg.username,
        totalMessages: 0,
        flaggedMessages: 0,
        totalRisk: 0,
        highestRisk: 0,
      };
    }

    acc[msg.username].totalMessages += 1;
    acc[msg.username].totalRisk += msg.risk_score;
    acc[msg.username].highestRisk = Math.max(
      acc[msg.username].highestRisk,
      msg.risk_score
    );

    if (msg.is_flagged) {
      acc[msg.username].flaggedMessages += 1;
    }

    return acc;
  }, {});

  const userReputationData = Object.values(userStats)
    .map((user) => {
      const averageRisk =
        user.totalMessages === 0
          ? 0
          : Math.round(user.totalRisk / user.totalMessages);

      let status = "Trusted";

      if (user.flaggedMessages >= 3 || averageRisk >= 60) {
        status = "Restricted";
      } else if (user.flaggedMessages >= 2 || averageRisk >= 40) {
        status = "Risky";
      } else if (user.flaggedMessages >= 1 || averageRisk >= 20) {
        status = "Watchlist";
      }

      return {
        ...user,
        averageRisk,
        status,
      };
    })
    .sort((a, b) => b.averageRisk - a.averageRisk);

  const canModerate = user?.role === "Moderator" || user?.role === "Admin";

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl">
          <h1 className="text-3xl font-bold mb-2 text-purple-400">
            LIVEGUARD AI
          </h1>

          <p className="text-slate-400 mb-6">
            Sign in to access the livestream safety dashboard.
          </p>

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setAuthMode("login")}
              className={`flex-1 py-2 rounded-lg ${
                authMode === "login" ? "bg-purple-600" : "bg-slate-800"
              }`}
            >
              Login
            </button>

            <button
              onClick={() => setAuthMode("register")}
              className={`flex-1 py-2 rounded-lg ${
                authMode === "register" ? "bg-purple-600" : "bg-slate-800"
              }`}
            >
              Register
            </button>
          </div>

          <input
            className="w-full bg-slate-800 rounded-lg px-3 py-2 mb-3 outline-none border border-slate-700"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
          />

          <input
            className="w-full bg-slate-800 rounded-lg px-3 py-2 mb-3 outline-none border border-slate-700"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />

          {authMode === "register" && (
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-slate-800 rounded-lg px-3 py-2 mb-3 outline-none border border-slate-700"
            >
              <option>Viewer</option>
              <option>Moderator</option>
              <option>Admin</option>
            </select>
          )}

          {authError && (
            <p className="text-red-400 text-sm mb-3">{authError}</p>
          )}

          <button
            onClick={handleAuth}
            className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-lg font-medium"
          >
            {authMode === "login" ? "Login" : "Create Account"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 text-white min-h-screen flex">
      <Sidebar activePage={activePage} setActivePage={setActivePage} />

      <main className="flex-1 p-6 overflow-auto">
        <TopBar username={user.username} role={user.role} />

        {activePage === "Dashboard" && (
          <div className="flex justify-between items-center mt-6 mb-6">
          <div>
            <p className="text-slate-400">
              Real-time livestream moderation dashboard
            </p>

            <p className="text-slate-500 text-sm mt-1">
              Current Stream Room:{" "}
              <span className="text-purple-400">{ROOM_ID}</span>
            </p>
          </div>

          <button
            onClick={logout}
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2 rounded-xl text-sm"
          >
            Logout
          </button>
          </div>
        )}

        {activePage === "Live Streams" && (
          <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-6">
            <h2 className="text-2xl font-bold mb-2">Live Streams</h2>
            <p className="text-slate-400 mb-6">
              Monitor active livestream rooms and safety status.
            </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {["demo-room", "gaming-live", "shopping-live"].map((room) => (
             <div
                key={room}
                className="bg-slate-900/80 border border-slate-700 rounded-xl p-5"
              >
              <div className="flex justify-between mb-3">
                 <h3 className="font-semibold">{room}</h3>
                 <span className="text-green-400 text-sm">LIVE</span>
            </div>

            <p className="text-slate-400 text-sm">12.4K viewers</p>
            <p className="text-slate-400 text-sm mt-1">
                Safety Score: {safetyScore}%
            </p>

            <button
              onClick={() => setActivePage("Dashboard")}
              className="mt-4 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm"
            >
              Open Dashboard
            </button>
          </div>
        ))}
      </div>
    </div>
  )}

  {activePage === "Moderators" && (
  <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-6">
    <h2 className="text-2xl font-bold mb-2">Moderators</h2>
    <p className="text-slate-400 mb-6">
      View team members responsible for reviewing flagged content.
    </p>

    <div className="space-y-3">
      {[user, { username: "maya", role: "Analyst" }, { username: "sam", role: "Admin" }].map(
        (mod) => (
          <div
            key={mod.username}
            className="bg-slate-900/80 border border-slate-700 rounded-xl p-4 flex justify-between"
          >
            <div>
              <p className="font-semibold">@{mod.username}</p>
              <p className="text-slate-500 text-sm">{mod.role}</p>
            </div>

            <span className="text-green-400 text-sm">Online</span>
          </div>
        )
      )}
    </div>
  </div>
)}

{activePage === "Cases" && (
  <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-6">
    <h2 className="text-2xl font-bold mb-2">Cases</h2>
    <p className="text-slate-400 mb-6">
      Review and resolve safety cases created from flagged messages.
    </p>

    {cases.length === 0 ? (
      <p className="text-slate-400">No cases created yet.</p>
    ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cases.map((caseItem) => (
          <div
            key={caseItem.case_id}
            className="bg-slate-900/80 border border-slate-700 rounded-xl p-4"
          >
            <div className="flex justify-between mb-2">
              <p className="font-semibold">Case #{caseItem.case_id}</p>
              <span className="text-red-400 text-sm">{caseItem.priority}</span>
            </div>

            <p className="text-slate-300 text-sm">
              @{caseItem.username}: “{caseItem.message}”
            </p>

            <p className="text-slate-500 text-xs mt-2">
              {caseItem.category} · Risk {caseItem.risk_score}
            </p>
          </div>
        ))}
      </div>
    )}
  </div>
)}

{activePage === "Settings" && (
  <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-6">
    <h2 className="text-2xl font-bold mb-2">Settings</h2>
    <p className="text-slate-400 mb-6">
      Configure moderation thresholds and platform behaviour.
    </p>

    <div className="space-y-4 max-w-xl">
      <div>
        <label className="text-sm text-slate-400">High Risk Threshold</label>
        <input
          className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
          value="70"
          readOnly
        />
      </div>

      <div>
        <label className="text-sm text-slate-400">Auto Flag Threshold</label>
        <input
          className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
          value="35"
          readOnly
        />
      </div>

      <div>
        <label className="text-sm text-slate-400">Current Room</label>
        <input
          className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
          value={ROOM_ID}
          readOnly
        />
      </div>
    </div>
  </div>
)}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-4">
            <p className="text-slate-400 text-sm">Total Messages</p>
            <p className="text-3xl font-bold mt-1">{messages.length}</p>
          </div>

          <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-4">
            <p className="text-slate-400 text-sm">Safe</p>
            <p className="text-3xl font-bold text-green-400 mt-1">
              {safeMessages.length}
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-4">
            <p className="text-slate-400 text-sm">Medium Risk</p>
            <p className="text-3xl font-bold text-yellow-400 mt-1">
              {mediumRiskMessages.length}
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-4">
            <p className="text-slate-400 text-sm">High Risk</p>
            <p className="text-3xl font-bold text-red-400 mt-1">
              {highRiskMessages.length}
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-4">
            <p className="text-slate-400 text-sm">Safety Score</p>
            <p
              className={`text-3xl font-bold mt-1 ${
                safetyScore >= 80
                  ? "text-green-400"
                  : safetyScore >= 50
                  ? "text-yellow-400"
                  : "text-red-400"
              }`}
            >
              {safetyScore}%
            </p>
          </div>
        </div>

        {highRiskMessages.length > 0 && (
          <div className="mb-6 bg-red-950/60 border border-red-700 rounded-2xl p-4">
            <p className="text-red-300 font-semibold">
              ⚠ High-risk activity detected in livestream chat
            </p>

            <p className="text-slate-300 text-sm mt-1">
              {highRiskMessages.length} high-severity messages require
              immediate moderation.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-5">
            <h2 className="text-lg font-semibold mb-4">
              Severity Distribution
            </h2>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={severityChartData}>
                  <XAxis dataKey="name" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#020617",
                      border: "1px solid #334155",
                      borderRadius: "12px",
                      color: "#fff",
                    }}
                  />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-5">
            <h2 className="text-lg font-semibold mb-4">
              Moderation Categories
            </h2>

            <div className="h-64">
              {categoryChartData.length === 0 ? (
                <p className="text-slate-400">No data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryChartData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={90}
                      label
                    >
                      {categoryChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            [
                              "#22c55e",
                              "#facc15",
                              "#fb923c",
                              "#ef4444",
                              "#8b5cf6",
                            ][index % 5]
                          }
                        />
                      ))}
                    </Pie>

                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#020617",
                        border: "1px solid #334155",
                        borderRadius: "12px",
                        color: "#fff",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-5 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            Live Moderation Activity
          </h2>

          {activityFeed.length === 0 ? (
            <p className="text-slate-400">No moderation activity yet.</p>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {activityFeed.map((msg) => (
                  <motion.div
                    key={`${msg.id}-${msg.action_taken}`}
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    transition={{ duration: 0.25 }}
                    className="bg-slate-900/80 border border-slate-700 rounded-xl p-4 flex justify-between gap-4"
                  >
                    <div>
                      <p className="font-medium">
                        @{msg.username} triggered {msg.category}
                      </p>

                      <p className="text-sm text-slate-400 mt-1">
                        “{msg.message}”
                      </p>
                    </div>

                    <div className="text-right">
                      <p
                        className={`text-sm font-semibold ${
                          msg.severity === "high"
                            ? "text-red-400"
                            : msg.severity === "medium"
                            ? "text-yellow-400"
                            : "text-orange-300"
                        }`}
                      >
                        Risk {msg.risk_score}
                      </p>

                      <p className="text-xs text-slate-500 mt-1">
                        {msg.action_taken === "none"
                          ? "Awaiting review"
                          : `Action: ${msg.action_taken.toUpperCase()}`}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-5 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            User Reputation Monitor
          </h2>

          {userReputationData.length === 0 ? (
            <p className="text-slate-400">No user activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="pb-3">User</th>
                    <th className="pb-3">Messages</th>
                    <th className="pb-3">Flagged</th>
                    <th className="pb-3">Avg Risk</th>
                    <th className="pb-3">Highest Risk</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {userReputationData.map((user) => (
                    <tr
                      key={user.username}
                      className="border-b border-slate-800"
                    >
                      <td className="py-3 font-medium">@{user.username}</td>
                      <td className="py-3">{user.totalMessages}</td>
                      <td className="py-3">{user.flaggedMessages}</td>
                      <td className="py-3">{user.averageRisk}</td>
                      <td className="py-3">{user.highestRisk}</td>
                      <td className="py-3">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            user.status === "Trusted"
                              ? "bg-green-950 text-green-400"
                              : user.status === "Watchlist"
                              ? "bg-yellow-950 text-yellow-400"
                              : user.status === "Risky"
                              ? "bg-orange-950 text-orange-400"
                              : "bg-red-950 text-red-400"
                          }`}
                        >
                          {user.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-5 mb-6">
          <h2 className="text-lg font-semibold mb-4">Case Review System</h2>

          {cases.length === 0 ? (
            <p className="text-slate-400">No cases created yet.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {cases.map((caseItem) => (
                <div
                  key={caseItem.case_id}
                  className="bg-slate-900/80 border border-slate-700 rounded-xl p-4"
                >
                  <div className="flex justify-between mb-2">
                    <p className="font-semibold">Case #{caseItem.case_id}</p>

                    <span
                      className={`text-xs px-3 py-1 rounded-full ${
                        caseItem.priority === "High"
                          ? "bg-red-950 text-red-400"
                          : "bg-yellow-950 text-yellow-400"
                      }`}
                    >
                      {caseItem.priority}
                    </span>
                  </div>

                  <p className="text-sm text-slate-300 mb-2">
                    @{caseItem.username}: “{caseItem.message}”
                  </p>

                  <p className="text-xs text-slate-500 mb-4">
                    Category: {caseItem.category} · Risk {caseItem.risk_score}
                  </p>

                  <p className="text-sm text-slate-300 mb-3">
                    {caseItem.ai_explanation}
                  </p>

                  <div className="flex gap-2">
                    {["Open", "Investigating", "Resolved"].map((status) => (
                      <button
                        key={status}
                        onClick={() =>
                          updateCaseStatus(caseItem.case_id, status)
                        }
                        className={`px-3 py-1 rounded-lg text-xs ${
                          caseItem.status === status
                            ? "bg-purple-600 text-white"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-5">
            <h2 className="text-xl font-semibold mb-4">Live Chat Simulator</h2>

            <div className="flex gap-3 mb-4">
              <input
                className="bg-slate-800 rounded-lg px-3 py-2 w-40 outline-none border border-slate-700"
                value={user.username}
                disabled
              />

              <input
                className="bg-slate-800 rounded-lg px-3 py-2 flex-1 outline-none border border-slate-700"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a live chat message..."
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              />

              <button
                onClick={sendMessage}
                className="bg-purple-600 hover:bg-purple-700 px-5 py-2 rounded-lg font-medium"
              >
                Send
              </button>
            </div>

            <div className="space-y-3 max-h-[520px] overflow-y-auto">
              <AnimatePresence>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`p-4 rounded-xl border ${
                      msg.is_flagged
                        ? "bg-red-950/40 border-red-700"
                        : "bg-slate-900/80 border-slate-700"
                    }`}
                  >
                    <div className="flex justify-between">
                      <span className="font-semibold">@{msg.username}</span>
                      <span
                        className={`text-sm ${
                          msg.severity === "high"
                            ? "text-red-400"
                            : msg.severity === "medium"
                            ? "text-yellow-400"
                            : msg.severity === "low"
                            ? "text-orange-300"
                            : "text-green-400"
                        }`}
                      >
                        {msg.severity.toUpperCase()} · Risk {msg.risk_score}
                      </span>
                    </div>

                    <p className="mt-2 text-slate-200">{msg.message}</p>

                    <p className="mt-1 text-xs text-slate-400">
                      Category: {msg.category}
                    </p>

                    {msg.ai_explanation && (
                      <div className="mt-3 bg-slate-900/80 border border-slate-700 rounded-xl p-3">
                        <p className="text-xs text-purple-400 font-semibold mb-1">
                          AI Moderation Assistant
                        </p>

                        <p className="text-sm text-slate-300">
                          {msg.ai_explanation}
                        </p>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-slate-500">Recommended</p>
                            <p className="text-slate-200 font-medium">
                              {msg.recommended_action?.toUpperCase()}
                            </p>
                          </div>

                          <div>
                            <p className="text-slate-500">Confidence</p>
                            <p className="text-slate-200 font-medium">
                              {msg.confidence}%
                            </p>
                          </div>
                        </div>

                        <p className="text-xs text-slate-500 mt-3">
                          {msg.policy_reason}
                        </p>
                      </div>
                    )}

                    {msg.flags?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {msg.flags.map((flag) => (
                          <span
                            key={flag}
                            className="text-xs bg-slate-700 px-2 py-1 rounded-full"
                          >
                            {flag}
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>

          <section className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-5">
            <h2 className="text-xl font-semibold mb-4">Flagged Queue</h2>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700">
                <p className="text-slate-400 text-sm">Total Messages</p>
                <p className="text-2xl font-bold">{messages.length}</p>
              </div>

              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700">
                <p className="text-slate-400 text-sm">Flagged</p>
                <p className="text-2xl font-bold text-red-400">
                  {flaggedMessages.length}
                </p>
              </div>
            </div>

            <div className="space-y-3 max-h-[520px] overflow-y-auto">
              <AnimatePresence>
                {flaggedMessages.length === 0 ? (
                  <p className="text-slate-400">No flagged messages yet.</p>
                ) : (
                  flaggedMessages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2 }}
                      className="bg-red-950/40 border border-red-700 p-4 rounded-xl"
                    >
                      <div className="flex justify-between mb-2">
                        <span className="font-semibold">@{msg.username}</span>
                        <span className="text-red-400 text-sm">
                          Risk {msg.risk_score}
                        </span>
                      </div>

                      <p className="text-sm text-slate-200">{msg.message}</p>

                      <p className="mt-1 text-xs text-slate-400">
                        Category: {msg.category}
                      </p>

                      {msg.ai_explanation && (
                        <div className="mt-3 bg-slate-900/80 border border-slate-700 rounded-xl p-3">
                          <p className="text-xs text-purple-400 font-semibold mb-1">
                            AI Moderation Assistant
                          </p>

                          <p className="text-sm text-slate-300">
                            {msg.ai_explanation}
                          </p>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-slate-500">Recommended</p>
                              <p className="text-slate-200 font-medium">
                                {msg.recommended_action?.toUpperCase()}
                              </p>
                            </div>

                            <div>
                              <p className="text-slate-500">Confidence</p>
                              <p className="text-slate-200 font-medium">
                                {msg.confidence}%
                              </p>
                            </div>
                          </div>

                          <p className="text-xs text-slate-500 mt-3">
                            {msg.policy_reason}
                          </p>
                        </div>
                      )}

                      {!canModerate ? (
                        <p className="mt-3 text-sm text-slate-500">
                          View-only access · Moderator role required
                        </p>
                      ) : msg.action_taken === "none" ? (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {msg.recommended_action !== "none" && (
                            <button
                              onClick={() =>
                                takeAction(msg.id, msg.recommended_action)
                              }
                              className="bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded-lg text-sm"
                            >
                              Apply AI:{" "}
                              {msg.recommended_action?.toUpperCase()}
                            </button>
                          )}

                          <button
                            onClick={() => takeAction(msg.id, "warn")}
                            className="bg-yellow-600 hover:bg-yellow-700 px-3 py-1 rounded-lg text-sm"
                          >
                            Warn
                          </button>

                          <button
                            onClick={() => takeAction(msg.id, "mute")}
                            className="bg-orange-600 hover:bg-orange-700 px-3 py-1 rounded-lg text-sm"
                          >
                            Mute
                          </button>

                          <button
                            onClick={() => takeAction(msg.id, "ban")}
                            className="bg-red-700 hover:bg-red-800 px-3 py-1 rounded-lg text-sm"
                          >
                            Ban
                          </button>

                          <button
                            onClick={() => createCase(msg.id)}
                            className="bg-blue-700 hover:bg-blue-800 px-3 py-1 rounded-lg text-sm"
                          >
                            Create Case
                          </button>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-green-400">
                          Action taken: {msg.action_taken.toUpperCase()}
                        </p>
                      )}
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;