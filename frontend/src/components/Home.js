import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function Home({ nickname, setNickname }) {
  const [presentations, setPresentations] = useState([]);
  const [newPresentationName, setNewPresentationName] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    fetch("http://localhost:5000/api/presentations")
      .then((res) => res.json())
      .then((data) => setPresentations(data))
      .catch((err) => console.error(err));
  }, []);

  const handleCreatePresentation = () => {
    if (!newPresentationName) return;
    fetch("http://localhost:5000/api/presentations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPresentationName }),
    })
      .then((res) => res.json())
      .then((data) => {
        navigate(`/presentation/${data.presentationId}`);
      })
      .catch((err) => console.error(err));
  };

  const handleJoin = (id) => {
    navigate(`/presentation/${id}`);
  };

  return (
    <div className="container mt-5">
      <h1>Collaborative Presentation</h1>
      <div className="mb-3">
        <label className="form-label">Your Nickname</label>
        <input
          type="text"
          className="form-control"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Enter your nickname"
        />
      </div>
      <div className="mb-3">
        <label className="form-label">Create New Presentation</label>
        <input
          type="text"
          className="form-control"
          value={newPresentationName}
          onChange={(e) => setNewPresentationName(e.target.value)}
          placeholder="Presentation name"
        />
        <button
          className="btn btn-primary mt-2"
          onClick={handleCreatePresentation}
          disabled={!nickname}
        >
          Create
        </button>
      </div>
      <hr />
      <h3>Existing Presentations</h3>
      <ul className="list-group">
        {presentations.map((p) => (
          <li
            key={p.id}
            className="list-group-item d-flex justify-content-between align-items-center"
          >
            {p.name}
            <button
              className="btn btn-sm btn-secondary"
              disabled={!nickname}
              onClick={() => handleJoin(p.id)}
            >
              Join
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Home;