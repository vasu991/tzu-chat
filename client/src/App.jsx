
import { UserContextProvider } from "./UserContext.jsx";
import axios from "axios";
import Routes from "./Routes.jsx";

function App() {
  axios.defaults.baseURL = import.meta.env.VITE_REACT_API_PROD;
  axios.defaults.withCredentials = true;
  return (
      <UserContextProvider>
        <Routes />
      </UserContextProvider>
  )
}

export default App
