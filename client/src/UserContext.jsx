import {createContext, useEffect, useState} from "react";
import axios from "axios";

export const UserContext = createContext({});

// eslint-disable-next-line react/prop-types
export function UserContextProvider({children}) {
  const [username, setUsername] = useState(null);
  const [id, setId] = useState(null);
  useEffect(() => {
    axios.get('/api/profile')
    .then(response => {
      setId(response.data.userId);
      setUsername(response.data.username);
    })
    .catch((err) => {console.log(err)});
  }, []);
  return (
    <UserContext.Provider value={{username, setUsername, id, setId}}>
      {children}
    </UserContext.Provider>
  );
}