import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import io from "socket.io-client";
import ReactMarkdown from "react-markdown";
import "bootstrap/dist/css/bootstrap.min.css";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

let socket;

function Presentation({ nickname }) {
  const { id } = useParams();
  const navigate = useNavigate();
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
    const text = prompt("Enter text here)");
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

  const handleExportToPDF = async () => {
    const canvas = await html2canvas(slideRef.current);
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    pdf.save("presentation.pdf");
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
      <nav
        className="navbar navbar-light bg-light"
        style={{ justifyContent: "space-between", padding: "0.5rem 1rem" }}
      >
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {!presentMode && isCreator && (
            <button className="btn btn-primary" onClick={addSlide}>
              Add Slide
            </button>
          )}
          {!presentMode && isEditor && (
            <>
              <button className="btn btn-success" onClick={handleAddTextBlock}>
                Add Text
              </button>
              <button className="btn btn-info" onClick={handleAddImageBlock}>
                Add Image
              </button>
            </>
          )}
          {!presentMode && (
            <div className="d-flex align-items-center">
              <label className="me-2 mb-0">Zoom:</label>
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
          {!presentMode && (
            <button className="btn btn-warning" onClick={() => setPresentMode(true)}>
              Present Mode
            </button>
          )}
          {!presentMode && (
            <button className="btn btn-secondary" onClick={handleExportToPDF}>
              Export to PDF
            </button>
          )}
        </div>
        <div>
          {presentMode && (
            <button className="btn btn-danger me-2" onClick={() => setPresentMode(false)}>
              Exit Present Mode
            </button>
          )}
          <button className="btn btn-outline-dark" onClick={() => navigate("/")}>
            Exit Presentation
          </button>
        </div>
      </nav>
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {!presentMode && (
          <div style={{ width: "220px", background: "#f1f1f1", overflowY: "auto" }}>
            <h5 className="p-2">Slides</h5>
            <ul className="list-group px-2 mb-2">
              {presentation.slides.map((s, i) => (
                <li
                  key={s.id}
                  className={`list-group-item mb-1 ${
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
                      cursor: "pointer",
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
          <div style={{ width: "220px", background: "#f1f1f1", overflowY: "auto" }}>
            <h5 className="p-2">Users</h5>
            <ul className="list-group px-2 mb-2">
              {Object.entries(users).map(([sockId, user]) => (
                <li key={sockId} className="list-group-item mb-1">
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
                        className="btn btn-sm btn-outline-warning"
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
