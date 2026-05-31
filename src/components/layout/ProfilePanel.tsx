import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { useAuthStore } from "~src/store/useAuthStore";
import { v7 as uuidv7 } from "uuid";

export function ProfilePanel() {
  const { savedSpaces, activeSpaceId, setActiveSpace, addSavedSpace } = useSavedSpacesStore();
  const { user, isAuthenticated, login, logout } = useAuthStore();

  const handleAddSpace = () => {
    const id = uuidv7();
    addSavedSpace({
      id,
      name: `Space ${savedSpaces.length + 1}`,
      projects: [],
    });
    setActiveSpace(id);
  };

  return (
    <div className="w-16 h-full flex flex-col border-r border-black-800">
      <div className="flex flex-col gap-3 py-4 items-center flex-1">
        {savedSpaces.map((space, index) => (
          <div
            key={space.id}
            onClick={() => setActiveSpace(space.id)}
            className={`w-10 h-10 rounded-full cursor-pointer transition-colors flex items-center justify-center text-xs font-medium font-sans ${
              activeSpaceId === space.id ? "bg-white/20 ring-2 ring-white/50 text-white/90" : "bg-black-800 hover:bg-black-700 text-white/50"
            }`}
            title={space.name}
          >
            {space.name.slice(0, 2).toUpperCase()}
          </div>
        ))}
        <div
          onClick={handleAddSpace}
          className="w-10 h-10 rounded-full border border-white/30 border-dashed text-white/50 flex items-center justify-center cursor-pointer hover:border-white/50 hover:text-white/70 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
      </div>
      <div className="flex flex-col gap-2 py-4 items-center">
        {isAuthenticated && user ? (
          <div
            onClick={logout}
            className="w-10 h-10 rounded-full cursor-pointer overflow-hidden"
            title={`${user.name}\n${user.email}\nClick to logout`}
          >
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
                {user.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={login}
            className="w-10 h-10 rounded-full bg-black-800 hover:bg-black-700 cursor-pointer flex items-center justify-center transition-colors"
            title="Sign in with Google"
          >
            <svg className="w-5 h-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}
