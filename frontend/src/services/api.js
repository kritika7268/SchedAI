export const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

import axios from 'axios';

// Helper to extract token from the stored auth_user object
function getAuthToken() {

// Helper to extract token from the stored auth_user object
function getAuthToken() {

// Helper to extract token from the stored auth_user object
function getAuthToken() {
  const stored = localStorage.getItem('auth_user');
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return parsed.access_token || null;
  } catch {
    return null;
  }
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000',
  withCredentials: true,
});

// Request interceptor: attach Authorization header if token exists
api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401 globally (optional – UI will also catch)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // clear auth and redirect to login page
      localStorage.removeItem('auth_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
