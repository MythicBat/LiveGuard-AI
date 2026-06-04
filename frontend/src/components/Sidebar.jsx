import {
  FaShieldAlt,
  FaVideo,
  FaUsers,
  FaFlag,
  FaCog,
  FaClipboardList,
} from "react-icons/fa";

export default function Sidebar({ activePage, setActivePage }) {
  const items = [
    { icon: <FaShieldAlt />, label: "Dashboard" },
    { icon: <FaVideo />, label: "Live Streams" },
    { icon: <FaUsers />, label: "Moderators" },
    { icon: <FaFlag />, label: "Cases" },
    { icon: <FaCog />, label: "Settings" },
    { icon: <FaClipboardList />, label: "Audit Logs" },
  ];

  return (
    <div className="w-64 bg-slate-900 border-r border-slate-800 h-screen sticky top-0">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-purple-400">LIVEGUARD AI</h1>
        <p className="text-slate-500 text-sm mt-1">
          Trust and Safety Platform
        </p>
      </div>

      <div className="mt-8 px-4">
        {items.map((item) => (
          <button
            key={item.label}
            onClick={() => setActivePage(item.label)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl mb-2 transition ${
              activePage === item.label
                ? "bg-purple-600 text-white"
                : "hover:bg-slate-800 text-slate-300"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}