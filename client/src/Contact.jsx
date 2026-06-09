import Avatar from "./Avatar.jsx";

export default function Contact({id,username,onClick,selected,online,statusMessage}) {
  return (
    <div key={id} onClick={() => onClick(id)}
         className={"border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 cursor-pointer "+(selected ? 'bg-blue-50 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-750')}>
      {selected && (
        <div className="w-1 bg-blue-500 h-12 rounded-r-md"></div>
      )}
      <div className="flex gap-2 py-2 pl-4 items-center">
        <Avatar online={online} username={username} userId={id} />
        <div className="flex flex-col">
          <span className="text-gray-800 dark:text-gray-200">{username}</span>
          {statusMessage && (
            <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[140px]">
              {statusMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}