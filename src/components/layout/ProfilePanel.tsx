import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { v7 as uuidv7 } from "uuid";

export function ProfilePanel() {
  const { savedSpaces, activeSpace, setActiveSpace, addSavedSpace } = useSavedSpacesStore();

  const handleAddSpace = () => {
    addSavedSpace({
      id: uuidv7(),
      name: `Space ${savedSpaces.length + 1}`,
      projects: [],
    });
    setActiveSpace(savedSpaces.length);
  };

  return (
    <div className="w-16 h-full flex flex-col border-r border-black-800">
      <div className="flex flex-col gap-3 py-4 items-center flex-1">
        {savedSpaces.map((space, index) => (
          <div
            key={space.id}
            onClick={() => setActiveSpace(index)}
            className={`w-10 h-10 rounded-full cursor-pointer transition-colors ${
              activeSpace === index ? "bg-white/20 ring-2 ring-white/50" : "bg-black-800 hover:bg-black-700"
            }`}
            title={space.name}
          ></div>
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
        <div className="w-10 h-10 bg-black-800 rounded-full"></div>
      </div>
    </div>
  )
}
