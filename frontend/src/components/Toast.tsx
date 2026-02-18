import React, { useEffect } from "react";

export type ToastType = "success" | "error" | "info";

export type ToastProps = {
    message: string;
    type?: ToastType;
    onClose: () => void;
    duration?: number;
};

export function Toast({ message, type = "info", onClose, duration = 3000 }: ToastProps) {
    useEffect(() => {
        const timer = setTimeout(onClose, duration);
        return () => clearTimeout(timer);
    }, [duration, onClose]);

    const bg = type === "success" ? "#00a884" : type === "error" ? "#ea4335" : "#333";

    return (
        <div style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: bg,
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 8,
            zIndex: 1000,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            animation: "fadeIn 0.3s ease-out"
        }}>
            {message}
        </div>
    );
}
