export default function TopBar({
  username,
  role,
  room
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between items-center">
      <div>
        <h2 className="font-semibold text-lg">
          Stream Safety Dashboard
        </h2>

        <p className="text-slate-400 text-sm">
          Monitoring Room: {room}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-medium">{username}</p>

          <p className="text-sm text-slate-500">
            {role}
          </p>
        </div>

        <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center font-bold">
          {username?.charAt(0)?.toUpperCase()}
        </div>
      </div>
    </div>
  );
}