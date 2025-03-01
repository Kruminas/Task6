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
  const slideRef = useRef(null);

  useEffect(() => {
    socket = io("http://localhost:5000");
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
    const el = {
      content: text,
      x: 50,
      y: 50,
    };
    const slideId = presentation.slides[selectedSlideIndex].id;
    addOrUpdateElement(slideId, el);
  };

  const handleAddImageBlock = () => {
    if (!presentation) return;
    const url = prompt("Enter image URL");
    if (!url) return;
    const el = {
      content: "img:" + url,
      x: 50,
      y: 50,
    };
    const slideId = presentation.slides[selectedSlideIndex].id;
    addOrUpdateElement(slideId, el);
  };

  const handleElementDrag = (e, el) => {
    const slideBox = slideRef.current.getBoundingClientRect();
    const newX = (e.clientX - slideBox.left) / zoom - 50;
    const newY = (e.clientY - slideBox.top) / zoom - 20;
    const slideId = presentation.slides[selectedSlideIndex].id;

    addOrUpdateElement(slideId, { ...el, x: newX, y: newY });
  };

  if (!presentation) {
    return <div className="container mt-5">Loading...</div>;
  }

  const currentSlide = presentation.slides[selectedSlideIndex];
  if (!currentSlide) {
    return <div className="container mt-5">No slides yet...</div>;
  }

  const myRole = users[socket.id]?.role || "viewer";
  const isCreator = myRole === "creator";
  const isEditor = isCreator || myRole === "editor";

  return (
    <div className="d-flex" style={{ height: "100vh" }}>
      {!presentMode && (
        <div className="bg-light p-2" style={{ width: "200px" }}>
          <h5>Slides</h5>
          <ul className="list-group">
            {presentation.slides.map((s, i) => (
              <li
                key={s.id}
                className={`list-group-item ${
                  i === selectedSlideIndex ? "active" : ""
                }`}
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
                  >
                    X
                  </button>
                )}
              </li>
            ))}
          </ul>
          {isCreator && (
            <button className="btn btn-primary mt-2" onClick={addSlide}>
              Add Slide
            </button>
          )}
          <hr />
          <label>Zoom:</label>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
          />
        </div>
      )}

      <div
        ref={slideRef}
        className="flex-grow-1 position-relative bg-secondary"
        style={{
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
                    const slideId = presentation.slides[selectedSlideIndex].id;
                    addOrUpdateElement(slideId, {
                      ...el,
                      content: "img:" + newUrl,
                    });
                  }
                } else {
                  const newText = prompt("Edit text (Markdown)", content);
                  if (newText !== null) {
                    const slideId = presentation.slides[selectedSlideIndex].id;
                    addOrUpdateElement(slideId, { ...el, content: newText });
                  }
                }
              }}
            >
              {isImage ? (
                <img src={imageUrl} alt="img-element" style={{ width: "200px" }} />
              ) : (
                <ReactMarkdown>{content}</ReactMarkdown>
              )}
            </div>
          );
        })}
      </div>

      {!presentMode && (
        <div className="bg-light p-2" style={{ width: "200px" }}>
          <h5>Users</h5>
          <ul className="list-group mb-2">
            {Object.entries(users).map(([sockId, user]) => (
              <li key={sockId} className="list-group-item">
                {user.nickname} ({user.role})
                {isCreator && sockId !== socket.id && (
                  <div className="mt-1">
                    <button
                      className="btn btn-sm btn-outline-primary me-1"
                      onClick={() => updateUserRole(sockId, "editor")}
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
          {isEditor && (
            <>
              <button
                className="btn btn-success mb-2"
                onClick={handleAddTextBlock}
              >
                Add Text
              </button>
              <button
                className="btn btn-secondary mb-2"
                onClick={handleAddImageBlock}
              >
                Add Image
              </button>
            </>
          )}
          <button
            className="btn btn-info"
            onClick={() => setPresentMode((pm) => !pm)}
          >
            {presentMode ? "Edit Mode" : "Present Mode"}
          </button>
        </div>
      )}
    </div>
  );
}

export default Presentation;