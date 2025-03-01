import React, { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./components/Home";
import Presentation from "./components/Presentation";
import "bootstrap/dist/css/bootstrap.min.css";

function App() {
  const [nickname, setNickname] = useState("");
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<Home nickname={nickname} setNickname={setNickname} />}
        />
        <Route
          path="/presentation/:id"
          element={<Presentation nickname={nickname} />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;