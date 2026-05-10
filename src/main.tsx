import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// ReactDOM.createRoot finds the #root div in index.html and hands it to React.
// StrictMode is a development helper — it runs certain checks twice to catch
// common mistakes early. It has no effect in production.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
