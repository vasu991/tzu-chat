
import { UserContextProvider } from "./UserContext.jsx";
import axios from "axios";
import Routes from "./Routes.jsx";

function App() { 
  axios.defaults.baseURL = "http://localhost:4040";
  axios.defaults.withCredentials = true;
  return (
      <UserContextProvider>
        <Routes />
      </UserContextProvider>
  )
}

export default App
