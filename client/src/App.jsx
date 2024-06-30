
import { UserContextProvider } from "./UserContext.jsx";
import axios from "axios";
import Routes from "./Routes.jsx";

function App() {
  axios.defaults.baseURL = "http://tzu-chat-api.vercel.app";
  axios.defaults.withCredentials = true;
  return (
      <UserContextProvider>
        <Routes />
      </UserContextProvider>
  )
}

export default App
