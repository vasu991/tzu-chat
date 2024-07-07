import { useContext, useEffect, useRef, useState } from "react";
import Logo from "./Logo";
import {UserContext} from "./UserContext.jsx";
import {uniqBy} from "lodash";
import axios from "axios";
import Contact from "./Contact.jsx";

export default function Chat() {
    const [ws, setWs] = useState(null);
    const [onlinePeople, setOnlinePeople] = useState({});
    const [offlinePeople, setOfflinePeople] = useState({});
    const [selectedUserId, setSelectedUserId] = useState(null);
    const {username, id, setId, setUsername} = useContext(UserContext);
    const [newMessageText, setNewMessageText] = useState('');
    const [messages, setMessages] = useState([]);
    const divUnderMessages = useRef();


    useEffect(() => {
        connectToWs();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      function connectToWs() {
        const ws = new WebSocket(import.meta.env.VITE_REACT_WSS_URL_PROD);
        ws.onopen = () => {
          console.log('WebSocket connection opened');
        };
        
        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };
        
        ws.onclose = (event) => {
          console.log('WebSocket connection closed:', event);
        };
        setWs(ws);
        ws.addEventListener('message', handleMessage);
        ws.addEventListener('close', () => {
          setTimeout(() => {
            console.log('Disconnected. Trying to reconnect.');
            connectToWs();
          }, 1000);
        });
      }

    function showOnlinePeople(peopleArray) {
        const people = {};
        peopleArray.forEach(({userId, username}) => {
            people[userId] = username;
        });
        setOnlinePeople(people);
    }

    function handleMessage(ev) {
        const messageData = JSON.parse(ev.data);
        // console.log({ev, messageData});
        if("online" in messageData) {
            showOnlinePeople(messageData.online);
        }
        else if("text" in messageData){
          if(messageData.sender === selectedUserId) {
            setMessages(prev => ([...prev, {...messageData}]));
          }
           
        }
    }

    function logout() {
      localStorage.clear();
      axios.post("/api/logout").then(() => {
        setWs(null);
        setId(null);
        setUsername(null);
      });
    }

    function sendMessage(ev, file = null) {
        if(ev) ev.preventDefault();
        ws.send(JSON.stringify({
            recipient: selectedUserId,
            text: newMessageText,
            file,
        }));
        setNewMessageText("");
        setMessages(prev => ([...prev, {
            text: newMessageText,
            sender: id,
            recipient: selectedUserId,
            _id: Date.now(),
        }]));

        if(file) {
          axios.get('/api/messages/'+selectedUserId).then(res => {
            setMessages(res.data);
          });
        }
    }

    function sendFile(ev) {
      const reader = new FileReader();
      reader.readAsDataURL(ev.target.files[0]);
      reader.onload = () => {
        sendMessage(null, {
          name: ev.target.files[0].name,
          data: reader.result,
        });
      };
    }



    useEffect(() => {
        
        const div = divUnderMessages.current;
        if(div) { 
            div.scrollIntoView({behavior: "smooth", block: "end"});
        }
    }, [messages]);

    useEffect(() => {
        axios.get('/api/people').then(res => {
          const offlinePeopleArr = res.data
            .filter(p => p._id !== id)
            .filter(p => !Object.keys(onlinePeople).includes(p._id));
          const offlinePeople = {};
          offlinePeopleArr.forEach(p => {
            offlinePeople[p._id] = p;
          });
          setOfflinePeople(offlinePeople);
        });
      // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [onlinePeople]);
    
      useEffect(() => {
        if (selectedUserId) {
          axios.get('/api/messages/'+selectedUserId).then(res => {
            setMessages(res.data);
          });
        }
      }, [selectedUserId]);
    


    const onlinePeopleExclOurUser = {...onlinePeople};
    delete onlinePeopleExclOurUser[id];
    const messagesWithoutDupes = uniqBy(messages, "_id");
    return(
        <div className="flex h-screen">
            <div className="bg-white w-1/3 flex flex-col">

            <div className="flex-grow">
            <Logo />
                {Object.keys(onlinePeopleExclOurUser).map(userId => (
            <Contact
              key={userId}
              id={userId}
              online={true}
              username={onlinePeopleExclOurUser[userId]}
              onClick={() => {setSelectedUserId(userId);console.log({userId})}}
              selected={userId === selectedUserId} />
          ))}
          {Object.keys(offlinePeople).map(userId => (
            <Contact
              key={userId}
              id={userId}
              online={false}
              username={offlinePeople[userId].username}
              onClick={() => setSelectedUserId(userId)}
              selected={userId === selectedUserId} />
          ))}
          </div>
          <div className="p-2 text-center flex items-center justify-center">
            <span className="mr-2 text-sm text-gray-600 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-4">
            <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
            </svg>
               {username}</span>
            <button
            onClick={logout}
            className="text-sm text-gray-500 bg-blue-200 py-1 px-2 border rounded-sm">Logout</button>
          </div>
            </div>
            <div className="flex flex-col bg-blue-50 w-2/3 p-2">
                <div className="flex-grow">
                    {!selectedUserId && (
                        <div className="flex h-full flex-grow items-center justify-center">
                            <div className="text-gray-400">&larr; Select a person from the sidebar</div>
                        </div>
                    )}
                    {!!selectedUserId && (
                            <div className="relative h-full">
                            <div
                            className="overflow-y-scroll absolute top-0 left-0 right-0 bottom-2">
                            {messagesWithoutDupes.map(message => (
                                <div
                                key={message._id}
                                className={(message.sender === id ? "text-right" : "text-left")}>
                                    <div className={"text-left inline-block p-2 my-2 rounded-md text-sm " + (message.sender === id ? "bg-blue-500 text-white" : "bg-white text-gray-500")}>
                                    {message.text}
                                    {message.file && (
                                      <div className="">
                                        <a
                                        target="_blank"
                                        className="flex items-center gap-1 border-b"
                                        href={axios.defaults.baseURL + '/uploads/' + message.file}>
                                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                      </svg>
                                        {message.file}
                                        </a>
    
                                      </div>
                                    )}
                                    </div>
                                </div>
                            ))}
                            <div
                            ref={divUnderMessages}>
                            </div>
                        </div>
                        </div>
                    )}
                </div>
                {!!selectedUserId && (
                    <form id="chat-input" className="flex gap-2" onSubmit={sendMessage}>
                      <label
                      className="bg-gray-200 p-2 border rounded-sm cursor-pointer  text-gray-600 border-blue-200"
                      type="button">
                        <input type="file" className="hidden"
                        onChange={sendFile}
                        />
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                      </svg>

                      </label>
                        <input type="text"
                        value={newMessageText}
                        onChange={ev => setNewMessageText(ev.target.value)}
                        placeholder="Type your message here"
                        className="bg-white border p-2 flex-grow rounded-sm"/>
                        <button type="submit" className="bg-blue-500 p-2 text-white rounded-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                            </svg>
                        </button>
                  </form>
                )}
            </div>

        </div>
    );
}