import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import io from "socket.io-client";
import ReactMarkdown from "react-markdown";

let socket;

function Presentation({ nickname }) {
  const { id } = useParams();
  const [presentation, setPresentation] = useState(null);
  const [users, setUsers] = useState({});
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [presentMode, setPresentMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [hoveredElId, setHoveredElId] = useState(null);
  const slideRef = useRef(null);

  useEffect(() => {
    socket = io();
    socket.on("connect", () => {
      socket.emit("join-presentation", {
        presentationId: id,
        nickname: nickname || "Guest",
      });
    });
    socket.on("error-message", (message) => {
      alert(message);
    });
    socket.on("presentation-data", (data) => {
      setPresentation({ ...data });
    });
    socket.on("update-user-list", (updatedUsers) => {
      setUsers(updatedUsers);
    });
    return () => {
      socket.disconnect();
    };
  }, [id, nickname]);

  const addOrUpdateElement = (slideId, element) => {
    socket.emit("update-element", { slideId, element });
  };

  const addSlide = () => {
    socket.emit("add-slide");
  };

  const removeSlide = (slideId) => {
    socket.emit("remove-slide", slideId);
    setSelectedSlideIndex(0);
  };

  const updateUserRole = (userSocketId, newRole) => {
    socket.emit("update-user-role", { userSocketId, newRole });
  };

  const handleAddTextBlock = () => {
    if (!presentation) return;
    const text = prompt("Enter text (Markdown supported)");
    if (!text) return;
    const el = { content: text, x: 50, y: 50 };
    const slideId = presentation.slides[selectedSlideIndex].id;
    addOrUpdateElement(slideId, el);
  };

  const handleAddImageBlock = () => {
    if (!presentation) return;
    const url = prompt("Enter image URL");
    if (!url) return;
    const el = { content: "img:" + url, x: 50, y: 50 };
    const slideId = presentation.slides[selectedSlideIndex].id;
    addOrUpdateElement(slideId, el);
  };

  const handleRemoveElement = (slideId, shapeId) => {
    socket.emit("remove-shape", { slideId, shapeId });
  };

  const handleElementDrag = (e, el) => {
    const slideBox = slideRef.current.getBoundingClientRect();
    const newX = (e.clientX - slideBox.left) / zoom - 50;
    const newY = (e.clientY - slideBox.top) / zoom - 20;
    const slideId = presentation.slides[selectedSlideIndex].id;
    addOrUpdateElement(slideId, { ...el, x: newX, y: newY });
  };

  if (!presentation) {
    return <div style={{ padding: "1rem" }}>Loading...</div>;
  }

  const currentSlide = presentation.slides[selectedSlideIndex];
  if (!currentSlide) {
    return <div style={{ padding: "1rem" }}>No slides yet...</div>;
  }

  const myRole = users[socket.id]?.role || "viewer";
  const isCreator = myRole === "creator";
  const isEditor = isCreator || myRole === "editor";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#f8f9fa",
          padding: "0.5rem",
        }}
      >
        {!presentMode && (
          <div style={{ display: "flex", gap: "1rem" }}>
            {isCreator && (
              <button onClick={addSlide}>Add Slide</button>
            )}
            {isEditor && (
              <>
                <button onClick={handleAddTextBlock}>Add Text</button>
                <button onClick={handleAddImageBlock}>Add Image</button>
              </>
            )}
            <label style={{ display: "flex", alignItems: "center" }}>
              Zoom:
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                style={{ marginLeft: "0.5rem" }}
              />
            </label>
            {!presentMode && (
              <button onClick={() => setPresentMode(true)}>Present Mode</button>
            )}
          </div>
        )}
        {presentMode && (
          <button onClick={() => setPresentMode(false)}>Exit Present Mode</button>
        )}
      </div>
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {!presentMode && (
          <div style={{ width: "200px", background: "#f1f1f1", overflowY: "auto" }}>
            <h5 style={{ margin: "0.5rem" }}>Slides</h5>
            <ul className="list-group" style={{ margin: "0 0.5rem" }}>
              {presentation.slides.map((s, i) => (
                <li
                  key={s.id}
                  className={`list-group-item ${i === selectedSlideIndex ? "active" : ""}`}
                  onClick={() => setSelectedSlideIndex(i)}
                  style={{ cursor: "pointer" }}
                >
                  Slide {i + 1}
                  {isCreator && (
                    <button
                      className="btn btn-sm btn-danger float-end"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSlide(s.id);
                      }}
                      style={{ marginLeft: "1rem" }}
                    >
                      X
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div
          ref={slideRef}
          style={{
            flex: 1,
            position: "relative",
            background: "#aaa",
            overflow: "auto",
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
          }}
        >
          {currentSlide.elements.map((el) => {
            const content = typeof el.content === "string" ? el.content : "";
            const isImage = content.startsWith("img:");
            const imageUrl = isImage ? content.slice(4) : null;
            return (
              <div
                key={el.id}
                style={{
                  position: "absolute",
                  left: el.x + "px",
                  top: el.y + "px",
                  background: isImage ? "none" : "white",
                  padding: isImage ? "0" : "5px",
                  borderRadius: "5px",
                  cursor: isEditor ? "move" : "default",
                  maxWidth: "300px",
                }}
                onMouseEnter={() => setHoveredElId(el.id)}
                onMouseLeave={() => setHoveredElId(null)}
                onMouseDown={(e) => {
                  if (!isEditor) return;
                  if (e.button === 0) {
                    const handleMove = (moveEvent) => handleElementDrag(moveEvent, el);
                    const handleUp = () => {
                      document.removeEventListener("mousemove", handleMove);
                      document.removeEventListener("mouseup", handleUp);
                    };
                    document.addEventListener("mousemove", handleMove);
                    document.addEventListener("mouseup", handleUp);
                  }
                }}
                onDoubleClick={() => {
                  if (!isEditor) return;
                  if (isImage) {
                    const newUrl = prompt("Edit Image URL:", imageUrl);
                    if (newUrl !== null) {
                      addOrUpdateElement(currentSlide.id, { ...el, content: "img:" + newUrl });
                    }
                  } else {
                    const newText = prompt("Edit text (Markdown)", content);
                    if (newText !== null) {
                      addOrUpdateElement(currentSlide.id, { ...el, content: newText });
                    }
                  }
                }}
              >
                {isImage ? (
                  <img src={imageUrl} alt="img-element" style={{ width: "200px" }} />
                ) : (
                  <ReactMarkdown>{content}</ReactMarkdown>
                )}
                {hoveredElId === el.id && isEditor && (
                  <button
                    style={{
                      backgroundColor: "red",
                      color: "white",
                      border: "none",
                      marginLeft: "5px",
                    }}
                    onClick={() => handleRemoveElement(currentSlide.id, el.id)}
                  >
                    X
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {!presentMode && (
          <div style={{ width: "200px", background: "#f1f1f1", overflowY: "auto" }}>
            <h5 style={{ margin: "0.5rem" }}>Users</h5>
            <ul className="list-group" style={{ margin: "0 0.5rem" }}>
              {Object.entries(users).map(([sockId, user]) => (
                <li key={sockId} className="list-group-item">
                  {user.nickname} ({user.role})
                  {isCreator && sockId !== socket.id && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <button
                        className="btn btn-sm btn-outline-primary me-1"
                        onClick={() => updateUserRole(sockId, "editor")}
                        style={{ marginRight: "0.5rem" }}
                      >
                        Editor
                      </button>
                      <button
                        className="btn btn-sm btn-outline-warning me-1"
                        onClick={() => updateUserRole(sockId, "viewer")}
                      >
                        Viewer
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default Presentation;