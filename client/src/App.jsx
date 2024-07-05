
import { UserContextProvider } from "./UserContext.jsx";
import axios from "axios";
import Routes from "./Routes.jsx";

function App() { 
<<<<<<< HEAD
  axios.defaults.baseURL = "https://tzu-chat-backend.vercel.app";
=======
  axios.defaults.baseURL = "http://localhost:4040";
>>>>>>> 24bd6b73b6cfb05fec62bdb5db78502d849a32a9
  axios.defaults.withCredentials = true;
  return (
      <UserContextProvider>
        <Routes />
      </UserContextProvider>
  )
}

export default App
