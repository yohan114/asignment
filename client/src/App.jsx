import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Trash2, CheckCircle2, Circle, Clock, AlertCircle, FileText, 
  Mic, Square, RefreshCw, UploadCloud, X, Calendar, 
  File, Key, BarChart3, Settings, Play, Pause, ChevronRight, LogOut, User, Lock, Users
} from 'lucide-react';
import './App.css';

// Centralised fetch wrapper for Authentication
const apiFetch = async (url, options = {}) => {
  const token = localStorage.getItem('auth_token');
  const headers = {
    ...options.headers
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.reload();
  }

  return response;
};

export default function App() {
  // Authentication states
  const [currentUser, setCurrentUser] = useState(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Assignments lists & details
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  
  // Input states (AI parser)
  const [files, setFiles] = useState([]);
  const [instructions, setInstructions] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  
  // Audio recording states
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const audioTimerRef = useRef(null);
  const audioPreviewRef = useRef(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // App configurations & UI states
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingFields, setEditingFields] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeCol, setActiveCol] = useState('todo'); // 'todo' | 'progress' | 'recorrection' | 'submitted'
  const [recorrectionFeedback, setRecorrectionFeedback] = useState('');
  const [isRaisingRecorrection, setIsRaisingRecorrection] = useState(false);

  // Profile modal states (Password change)
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [curPassword, setCurPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileError, setProfileError] = useState('');

  // User Management Modal states (Admin only)
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [usersList, setUsersList] = useState([]);
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createName, setCreateName] = useState('');
  const [createRole, setCreateRole] = useState('writer');
  const [userAdminMsg, setUserAdminMsg] = useState('');
  const [userAdminError, setUserAdminError] = useState('');

  // Manual Add states
  const [manualCode, setManualCode] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualSubject, setManualSubject] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualPriceReceived, setManualPriceReceived] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualDueDate, setManualDueDate] = useState('');
  const [manualEffort, setManualEffort] = useState('Medium');
  const [manualTasksText, setManualTasksText] = useState('');
  const [manualFiles, setManualFiles] = useState([]); 

  const [activeView, setActiveView] = useState('kanban'); // 'kanban' | 'dashboard' 

  // Check login on load
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('auth_user');
    if (token && userStr) {
      const user = JSON.parse(userStr);
      setCurrentUser(user);
    }
  }, []);

  // Fetch data after login
  useEffect(() => {
    if (currentUser) {
      fetchAssignments();
      const savedKey = localStorage.getItem('gemini_api_key');
      if (savedKey) {
        setCustomApiKey(savedKey);
      }
    }
  }, [currentUser]);

  // Auth Functions
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Login failed.');
      }

      const data = await res.json();
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));
      setCurrentUser(data.user);
      setLoginUsername('');
      setLoginPassword('');
    } catch (err) {
      setLoginError(err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setCurrentUser(null);
    setAssignments([]);
    setSelectedAssignment(null);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setProfileMsg('');
    setProfileError('');

    if (newPassword !== confirmPassword) {
      setProfileError('New passwords do not match.');
      return;
    }

    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: curPassword, newPassword: newPassword })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to change password.');
      }

      setProfileMsg('Password updated successfully.');
      setCurPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setProfileError(err.message);
    }
  };

  // Admin User Management API Calls
  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      }
    } catch (e) {
      console.error('Error fetching users:', e);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setUserAdminMsg('');
    setUserAdminError('');

    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username: createUsername,
          password: createPassword,
          role: createRole,
          name: createName
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create user.');
      }

      setUserAdminMsg(`User "${createUsername}" created successfully.`);
      setCreateUsername('');
      setCreatePassword('');
      setCreateName('');
      setCreateRole('writer');
      fetchUsers(); // Refresh list
    } catch (err) {
      setUserAdminError(err.message);
    }
  };

  const handleResetUserPassword = async (username) => {
    const newPass = window.prompt(`Enter new password for user "${username}":`);
    if (newPass === null || newPass === '') return;

    setUserAdminMsg('');
    setUserAdminError('');

    try {
      const res = await apiFetch(`/api/users/${username}/reset-password`, {
        method: 'PUT',
        body: JSON.stringify({ newPassword: newPass })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to reset password.');
      }

      setUserAdminMsg(`Password for user "${username}" reset successfully.`);
    } catch (err) {
      setUserAdminError(err.message);
    }
  };

  const handleDeleteUser = async (username) => {
    if (!window.confirm(`Are you sure you want to delete user "${username}"?`)) return;

    setUserAdminMsg('');
    setUserAdminError('');

    try {
      const res = await apiFetch(`/api/users/${username}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete user.');
      }

      setUserAdminMsg(`User "${username}" deleted successfully.`);
      fetchUsers();
    } catch (err) {
      setUserAdminError(err.message);
    }
  };

  // Open User Admin Modal
  const openUserAdmin = () => {
    setShowUsersModal(true);
    fetchUsers();
  };

  // Fetch Assignments on load
  const fetchAssignments = async () => {
    try {
      const res = await apiFetch('/api/assignments');
      if (res.ok) {
        const data = await res.json();
        setAssignments(data);
      }
    } catch (err) {
      console.error('Error fetching assignments:', err);
    }
  };

  // Recording Functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        setAudioBlob(blob);
        const voiceFile = new File([blob], `voice_instruction_${Date.now()}.wav`, { type: 'audio/wav' });
        setFiles(prev => [...prev, voiceFile]);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);
      audioTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access error:', err);
      setErrorMsg('Could not access microphone. Please verify browser permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      clearInterval(audioTimerRef.current);
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
  };

  const togglePlayAudioPreview = () => {
    if (!audioBlob) return;
    if (!audioPreviewRef.current) {
      const url = URL.createObjectURL(audioBlob);
      audioPreviewRef.current = new Audio(url);
      audioPreviewRef.current.onended = () => setIsPlayingAudio(false);
    }
    if (isPlayingAudio) {
      audioPreviewRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioPreviewRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  // Drag and Drop helpers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const addedFiles = Array.from(e.dataTransfer.files);
      setFiles(prev => [...prev, ...addedFiles]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const addedFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...addedFiles]);
    }
  };

  const removeFile = (indexToRemove) => {
    setFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
    if (files[indexToRemove].name.startsWith('voice_instruction_')) {
      setAudioBlob(null);
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        audioPreviewRef.current = null;
      }
      setIsPlayingAudio(false);
    }
  };

  // API Call - Smart Process
  const handleSmartAnalyze = async () => {
    if (!customApiKey) {
      setErrorMsg('Please configure your Gemini API Key in Settings first.');
      setShowSettings(true);
      return;
    }
    if (files.length === 0 && !instructions.trim()) {
      setErrorMsg('Please upload a file, record voice, or enter instructions first.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg('');

    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });
    formData.append('instructions', instructions);
    formData.append('customApiKey', customApiKey);

    try {
      const res = await apiFetch('/api/process', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Server error processing materials');
      }

      const data = await res.json();
      
      const saveRes = await apiFetch('/api/assignments', {
        method: 'POST',
        body: JSON.stringify(data)
      });

      if (saveRes.ok) {
        const newAssignment = await saveRes.json();
        setAssignments(prev => [...prev, newAssignment]);
        setFiles([]);
        setAudioBlob(null);
        setInstructions('');
        setSelectedAssignment(newAssignment);
      } else {
        throw new Error('Failed to save parsed assignment to database');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Processing failed. Check your API key or network.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Add manual assignment
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualTitle.trim()) {
      setErrorMsg('Assignment Title is required.');
      return;
    }

    const tasksArray = manualTasksText
      .split('\n')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    const formData = new FormData();
    formData.append('code', manualCode || 'Unknown');
    formData.append('title', manualTitle);
    formData.append('subject', manualSubject || 'General');
    formData.append('description', manualDesc);
    formData.append('dueDate', manualDueDate || '');
    formData.append('estimatedEffort', manualEffort);
    formData.append('price', manualPrice || '');
    formData.append('priceReceived', manualPriceReceived || '0');
    formData.append('tasks', JSON.stringify(tasksArray));
    
    manualFiles.forEach(file => {
      formData.append('files', file);
    });

    try {
      const res = await apiFetch('/api/assignments', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const newAssignment = await res.json();
        setAssignments(prev => [...prev, newAssignment]);
        setShowManualForm(false);
        setManualCode('');
        setManualTitle('');
        setManualSubject('');
        setManualPrice('');
        setManualPriceReceived('');
        setManualDesc('');
        setManualDueDate('');
        setManualEffort('Medium');
        setManualTasksText('');
        setManualFiles([]);
      } else {
        setErrorMsg('Failed to save manual assignment.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Error sending manual request.');
    }
  };

  // Update Status
  const updateStatus = async (id, nextStatus) => {
    try {
      const res = await apiFetch(`/api/assignments/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        const updated = await res.json();
        setAssignments(prev => prev.map(a => a.id === id ? updated : a));
        if (selectedAssignment && selectedAssignment.id === id) {
          setSelectedAssignment(updated);
        }
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  // Toggle checklist sub-task
  const toggleSubTask = async (assignment, taskId) => {
    // Only Writer or Admin can toggle checklist
    if (currentUser?.role === 'creator') return;

    const updatedTasks = assignment.tasks.map(t => 
      t.id === taskId ? { ...t, completed: !t.completed } : t
    );

    try {
      const res = await apiFetch(`/api/assignments/${assignment.id}`, {
        method: 'PUT',
        body: JSON.stringify({ tasks: updatedTasks })
      });
      if (res.ok) {
        const updated = await res.json();
        setAssignments(prev => prev.map(a => a.id === assignment.id ? updated : a));
        if (selectedAssignment && selectedAssignment.id === assignment.id) {
          setSelectedAssignment(updated);
        }
      }
    } catch (err) {
      console.error('Error updating checklist:', err);
    }
  };

  // Delete Assignment
  const deleteAssignment = async (id) => {
    if (!window.confirm("Are you sure you want to delete this assignment?")) return;
    try {
      const res = await apiFetch(`/api/assignments/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAssignments(prev => prev.filter(a => a.id !== id));
        setSelectedAssignment(null);
      }
    } catch (err) {
      console.error('Error deleting assignment:', err);
    }
  };

  // Upload more files to an active assignment (either reference attachments or submissions)
  const handleUploadMoreFiles = async (assignmentId, fileList, type) => {
    const formData = new FormData();
    Array.from(fileList).forEach(file => {
      formData.append('files', file);
    });
    
    const endpoint = type === 'submissions' 
      ? `/api/assignments/${assignmentId}/submissions` 
      : `/api/assignments/${assignmentId}/attachments`;
      
    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: formData
      });
      
      if (res.ok) {
        const updated = await res.json();
        setAssignments(prev => prev.map(a => a.id === assignmentId ? updated : a));
        setSelectedAssignment(updated);
      } else {
        const errData = await res.json();
        alert(errData.error || `Failed to upload ${type}.`);
      }
    } catch (err) {
      console.error(`Error uploading ${type}:`, err);
      alert(`Network error while uploading ${type}.`);
    }
  };

  // Save API key Settings
  const saveSettings = (e) => {
    e.preventDefault();
    localStorage.setItem('gemini_api_key', customApiKey);
    setShowSettings(false);
  };

  // Modal Editing Details helpers
  const startEditingDetails = () => {
    setEditingFields({
      code: selectedAssignment.code,
      title: selectedAssignment.title,
      subject: selectedAssignment.subject,
      dueDate: selectedAssignment.dueDate || '',
      estimatedEffort: selectedAssignment.estimatedEffort,
      price: selectedAssignment.price || '',
      priceReceived: selectedAssignment.priceReceived || '0',
      description: selectedAssignment.description
    });
  };

  const saveEditedDetails = async () => {
    try {
      const res = await apiFetch(`/api/assignments/${selectedAssignment.id}`, {
        method: 'PUT',
        body: JSON.stringify(editingFields)
      });
      if (res.ok) {
        const updated = await res.json();
        setAssignments(prev => prev.map(a => a.id === selectedAssignment.id ? updated : a));
        setSelectedAssignment(updated);
        setEditingFields(null);
      }
    } catch (err) {
      console.error('Error saving edits:', err);
    }
  };

  const formatTime = (sec) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = (tasks = []) => {
    if (tasks.length === 0) return 0;
    const completed = tasks.filter(t => t.completed).length;
    return Math.round((completed / tasks.length) * 100);
  };

  // Filtered lists
  const filteredAssignments = assignments.filter(a => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      a.title.toLowerCase().includes(query) ||
      a.code.toLowerCase().includes(query) ||
      a.subject.toLowerCase().includes(query) ||
      a.description.toLowerCase().includes(query);
    return matchesSearch;
  });

  const todoList = filteredAssignments.filter(a => a.status === 'Todo');
  const inProgressList = filteredAssignments.filter(a => a.status === 'In Progress');
  const recorrectionList = filteredAssignments.filter(a => a.status === 'Re-correction');
  const submittedList = filteredAssignments.filter(a => a.status === 'Submitted');

  // Stats calculation
  const totalCount = assignments.length;
  const submittedCount = assignments.filter(a => a.status === 'Submitted').length;
  const recorrectionCount = assignments.filter(a => a.status === 'Re-correction').length;
  const inProgressCount = assignments.filter(a => a.status === 'In Progress').length;
  const todoCount = assignments.filter(a => a.status === 'Todo').length;

  const totalPrice = assignments.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  const submittedPrice = assignments.filter(a => a.status === 'Submitted').reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  const recorrectionPrice = assignments.filter(a => a.status === 'Re-correction').reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  const pendingPrice = assignments.filter(a => a.status === 'Todo' || a.status === 'In Progress').reduce((sum, a) => sum + (Number(a.price) || 0), 0);

  const getMonthlyIncome = () => {
    const monthlyData = {};
    assignments.forEach(a => {
      if (!a.createdAt) return;
      const date = new Date(a.createdAt);
      const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      const sortKey = date.getFullYear() * 100 + date.getMonth();
      
      if (!monthlyData[monthName]) {
        monthlyData[monthName] = {
          monthName,
          sortKey,
          agreed: 0,
          received: 0,
          count: 0,
          completedCount: 0
        };
      }
      
      monthlyData[monthName].agreed += (Number(a.price) || 0);
      monthlyData[monthName].received += (Number(a.priceReceived) || 0);
      monthlyData[monthName].count += 1;
      if (a.status === 'Submitted') {
        monthlyData[monthName].completedCount += 1;
      }
    });
    
    return Object.values(monthlyData).sort((a, b) => b.sortKey - a.sortKey);
  };

  // --- RENDERING: LOGIN SCREEN (if not logged in) ---
  if (!currentUser) {
    return (
      <div className="login-container">
        <form className="login-box glass-panel" onSubmit={handleLogin}>
          <div className="login-logo">📁</div>
          <h2>AssignmentMaster</h2>
          <p className="login-subtitle">Speed Smart Academic Tracker</p>
          
          {loginError && (
            <div className="login-error">
              <AlertCircle size={16} />
              <span>{loginError}</span>
            </div>
          )}

          <div className="form-group">
            <label className="section-label">Username</label>
            <div className="input-with-icon">
              <User size={16} className="input-icon-symbol" />
              <input 
                type="text" 
                className="form-control" 
                placeholder="Enter username..." 
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="section-label">Password</label>
            <div className="input-with-icon">
              <Lock size={16} className="input-icon-symbol" />
              <input 
                type="password" 
                className="form-control" 
                placeholder="Enter password..." 
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-block btn-large btn-glow" style={{ marginTop: '1rem' }}>
            Sign In
          </button>

          <div className="login-hints">
            <strong>Default Accounts for Testing:</strong>
            <ul>
              <li>Admin: <code>admin</code> / <code>adminpassword</code></li>
              <li>Creator (Assignment Add): <code>creator</code> / <code>creatorpassword</code></li>
              <li>Writer (Assignment Do): <code>writer</code> / <code>writerpassword</code></li>
            </ul>
          </div>
        </form>
      </div>
    );
  }

  // --- RENDERING: MAIN APP VIEW (if logged in) ---
  return (
    <div className="app-container">
      
      {/* Top Banner Header */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-logo">📁</div>
          <div>
            <h1>AssignmentMaster</h1>
            <p className="subtitle">Speed Smart Tracking & Parsing</p>
          </div>
        </div>

        {/* User Status Bar in Header */}
        <div className="user-status-card">
          <div className="user-avatar-wrap">👤</div>
          <div className="user-profile-details">
            <span className="user-profile-name">{currentUser.name}</span>
            <span className={`role-badge ${currentUser.role}`}>
              {currentUser.role.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="header-actions">
          {currentUser.role === 'admin' && (
            <button className="btn btn-secondary btn-admin-users" onClick={openUserAdmin} title="User Accounts">
              <Users size={18} />
              <span>Users</span>
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setShowProfileModal(true)} title="My Password">
            <Key size={18} />
            <span>Profile</span>
          </button>
          {currentUser.role !== 'writer' && (
            <>
              <button className="btn btn-secondary" onClick={() => setShowSettings(true)}>
                <Settings size={18} />
                <span>Config</span>
              </button>
              <button className="btn btn-primary" onClick={() => setShowManualForm(true)}>
                <Plus size={18} />
                <span>Manual Add</span>
              </button>
            </>
          )}
          <button className="btn btn-danger" onClick={handleLogout} title="Sign Out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Stats Counter Bar */}
      <section className="stats-bar">
        <div className="stat-card total">
          <BarChart3 size={24} className="stat-icon" />
          <div className="stat-info">
            <span className="stat-value">${totalPrice.toLocaleString()}</span>
            <span className="stat-label">{totalCount} Total Assignments</span>
          </div>
        </div>
        <div className="stat-card todo">
          <Clock size={24} className="stat-icon" />
          <div className="stat-info">
            <span className="stat-value">${pendingPrice.toLocaleString()}</span>
            <span className="stat-label">{todoCount + inProgressCount} Pending Tasks</span>
          </div>
        </div>
        <div className="stat-card progress" style={{ borderColor: 'rgba(255, 153, 0, 0.2)' }}>
          <AlertCircle size={24} className="stat-icon" style={{ color: 'var(--color-amber)', background: 'rgba(255, 153, 0, 0.1)' }} />
          <div className="stat-info">
            <span className="stat-value" style={{ color: 'var(--color-amber)' }}>${recorrectionPrice.toLocaleString()}</span>
            <span className="stat-label">{recorrectionCount} Re-corrections</span>
          </div>
        </div>
        <div className="stat-card done" style={{ borderColor: 'rgba(0, 255, 135, 0.2)' }}>
          <CheckCircle2 size={24} className="stat-icon" style={{ color: 'var(--color-emerald)', background: 'rgba(0, 255, 135, 0.1)' }} />
          <div className="stat-info">
            <span className="stat-value" style={{ color: 'var(--color-emerald)' }}>${submittedPrice.toLocaleString()}</span>
            <span className="stat-label">{submittedCount} Submissions</span>
          </div>
        </div>
      </section>

      {/* Error alert */}
      {errorMsg && (
        <div className="alert alert-error">
          <AlertCircle size={20} />
          <span>{errorMsg}</span>
          <button className="alert-close" onClick={() => setErrorMsg('')}><X size={16} /></button>
        </div>
      )}

      {/* Workspace View Selector */}
      <div className="workspace-tabs-row glass-panel" style={{ display: 'flex', gap: '1rem', padding: '0.75rem 1.25rem', borderRadius: '16px', marginBottom: '1.5rem', border: '1px solid var(--panel-border)', background: 'rgba(18, 13, 35, 0.3)' }}>
        <button 
          type="button" 
          className={`workspace-tab-btn ${activeView === 'kanban' ? 'active' : ''}`}
          onClick={() => setActiveView('kanban')}
          style={{ 
            background: activeView === 'kanban' ? 'linear-gradient(135deg, var(--color-purple) 0%, var(--color-blue) 100%)' : 'transparent', 
            border: '1px solid',
            borderColor: activeView === 'kanban' ? 'transparent' : 'var(--panel-border)',
            color: '#fff', 
            padding: '0.6rem 1.5rem', 
            borderRadius: '12px', 
            fontWeight: '600', 
            cursor: 'pointer', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            transition: 'all 0.2s',
            boxShadow: activeView === 'kanban' ? '0 0 12px rgba(140, 70, 255, 0.3)' : 'none'
          }}
        >
          <span>📋 Kanban Workspace</span>
        </button>
        <button 
          type="button" 
          className={`workspace-tab-btn ${activeView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveView('dashboard')}
          style={{ 
            background: activeView === 'dashboard' ? 'linear-gradient(135deg, var(--color-purple) 0%, var(--color-blue) 100%)' : 'transparent', 
            border: '1px solid',
            borderColor: activeView === 'dashboard' ? 'transparent' : 'var(--panel-border)',
            color: '#fff', 
            padding: '0.6rem 1.5rem', 
            borderRadius: '12px', 
            fontWeight: '600', 
            cursor: 'pointer', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            transition: 'all 0.2s',
            boxShadow: activeView === 'dashboard' ? '0 0 12px rgba(140, 70, 255, 0.3)' : 'none'
          }}
        >
          <span>📊 Financial Dashboard & KPIs</span>
        </button>
      </div>

      {/* Layout Panels */}
      {activeView === 'dashboard' ? (
        <section className="glass-panel earnings-dashboard-panel" style={{ width: '100%', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Dashboard Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>Earnings & KPIs Dashboard</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.25rem 0 0' }}>Real-time earnings tracking, balance statements, and monthly-wise income distributions.</p>
            </div>
            <button className="btn btn-secondary" onClick={() => fetchAssignments()}>
              <RefreshCw size={14} />
              <span>Refresh Metrics</span>
            </button>
          </div>

          {/* KPI Metrics Summary Row */}
          <div className="form-grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            <div className="stat-card total" style={{ padding: '1.5rem', border: '1px solid var(--panel-border)' }}>
              <div className="stat-info">
                <span className="stat-value" style={{ fontSize: '1.75rem' }}>${totalPrice.toLocaleString()}</span>
                <span className="stat-label" style={{ fontWeight: '600', textTransform: 'uppercase', fontSize: '0.75rem' }}>Total Agreed Value</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>From {totalCount} projects</span>
              </div>
            </div>

            <div className="stat-card done" style={{ padding: '1.5rem', border: '1px solid rgba(0, 255, 135, 0.2)' }}>
              <div className="stat-info">
                <span className="stat-value" style={{ fontSize: '1.75rem', color: 'var(--color-emerald)' }}>
                  ${assignments.reduce((sum, a) => sum + (Number(a.priceReceived) || 0), 0).toLocaleString()}
                </span>
                <span className="stat-label" style={{ fontWeight: '600', textTransform: 'uppercase', fontSize: '0.75rem', color: 'var(--color-emerald)' }}>Total Payments Collected</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {((assignments.reduce((sum, a) => sum + (Number(a.priceReceived) || 0), 0) / (totalPrice || 1)) * 100).toFixed(1)}% recovery rate
                </span>
              </div>
            </div>

            <div className="stat-card progress" style={{ padding: '1.5rem', border: '1px solid rgba(255, 74, 110, 0.2)' }}>
              <div className="stat-info">
                <span className="stat-value" style={{ fontSize: '1.75rem', color: 'var(--color-rose)' }}>
                  ${(totalPrice - assignments.reduce((sum, a) => sum + (Number(a.priceReceived) || 0), 0)).toLocaleString()}
                </span>
                <span className="stat-label" style={{ fontWeight: '600', textTransform: 'uppercase', fontSize: '0.75rem', color: 'var(--color-rose)' }}>Outstanding Receivables</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Agreed Payout - Collected</span>
              </div>
            </div>

            <div className="stat-card todo" style={{ padding: '1.5rem', border: '1px solid rgba(0, 168, 255, 0.2)' }}>
              <div className="stat-info">
                <span className="stat-value" style={{ fontSize: '1.75rem', color: 'var(--color-cyan)' }}>
                  ${pendingPrice.toLocaleString()}
                </span>
                <span className="stat-label" style={{ fontWeight: '600', textTransform: 'uppercase', fontSize: '0.75rem', color: 'var(--color-cyan)' }}>Work-In-Progress Value</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{todoCount + inProgressCount} active projects</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }} className="form-grid-2">
            
            {/* Left side: Monthly-wise breakdown */}
            <div className="glass-panel" style={{ padding: '1.5rem', border: '1px solid var(--panel-border)' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>📆 Monthly Income Breakdown</h3>
              
              {getMonthlyIncome().length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No monthly distribution data available.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {getMonthlyIncome().map((month, idx) => {
                    const percent = Math.min(100, Math.round((month.received / (month.agreed || 1)) * 100));
                    return (
                      <div key={idx} style={{ paddingBottom: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                          <strong style={{ color: 'var(--text-main)' }}>{month.monthName}</strong>
                          <span style={{ color: 'var(--text-secondary)' }}>{month.count} projects ({month.completedCount} done)</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                          <span>Payout: <strong>${month.agreed.toLocaleString()}</strong></span>
                          <span>Collected: <strong style={{ color: 'var(--color-emerald)' }}>${month.received.toLocaleString()}</strong></span>
                        </div>
                        <div className="card-progress-track" style={{ height: '6px' }}>
                          <div 
                            className="card-progress-fill" 
                            style={{ 
                              width: `${percent}%`, 
                              background: percent === 100 ? 'var(--color-emerald)' : 'linear-gradient(90deg, var(--color-cyan) 0%, var(--color-emerald) 100%)' 
                            }}
                          ></div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textAlign: 'right', marginTop: '0.15rem' }}>
                          {percent}% Recovered
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right side: Project Financial Summary Table */}
            <div className="glass-panel" style={{ padding: '1.5rem', border: '1px solid var(--panel-border)', overflowX: 'auto' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>📂 Projects Billing Ledger</h3>
              
              <table className="users-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--panel-border)' }}>
                    <th style={{ textAlign: 'left', padding: '0.6rem 0.8rem', color: 'var(--text-secondary)' }}>Code</th>
                    <th style={{ textAlign: 'left', padding: '0.6rem 0.8rem', color: 'var(--text-secondary)' }}>Title</th>
                    <th style={{ textAlign: 'right', padding: '0.6rem 0.8rem', color: 'var(--text-secondary)' }}>Agreed</th>
                    <th style={{ textAlign: 'right', padding: '0.6rem 0.8rem', color: 'var(--text-secondary)' }}>Received</th>
                    <th style={{ textAlign: 'right', padding: '0.6rem 0.8rem', color: 'var(--text-secondary)' }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map(a => {
                    const balance = (Number(a.price) || 0) - (Number(a.priceReceived) || 0);
                    return (
                      <tr 
                        key={a.id} 
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', cursor: 'pointer' }}
                        className="ledger-row"
                        onClick={() => setSelectedAssignment(a)}
                      >
                        <td style={{ padding: '0.6rem 0.8rem' }}><span className="tag-code" style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem' }}>{a.code}</span></td>
                        <td style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>{a.title}</td>
                        <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>${(Number(a.price) || 0).toLocaleString()}</td>
                        <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', color: 'var(--color-emerald)' }}>${(Number(a.priceReceived) || 0).toLocaleString()}</td>
                        <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', color: balance > 0 ? 'var(--color-rose)' : 'var(--text-secondary)' }}>
                          {balance > 0 ? `$${balance.toLocaleString()}` : '$0'}
                        </td>
                      </tr>
                    );
                  })}
                  {assignments.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No assignments recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </section>
      ) : (
        <main className="main-content">
        
        {/* Creator panel (Left side - visible only for Admin and Creator) */}
        <section className="creator-panel glass-panel">
          {currentUser.role === 'writer' ? (
            <div className="writer-lockout-card">
              <div className="writer-logo-shield">🛡️</div>
              <h3>Writer Workspace</h3>
              <p>You have writer permissions. Select assignments from the board on the right to start working, tick off guidelines, upload final submissions, or review correction feedback.</p>
              <div className="writer-stats-summary">
                <div className="w-stat">
                  <span>Pending:</span>
                  <strong>{todoCount + inProgressCount}</strong>
                </div>
                <div className="w-stat">
                  <span>Corrections:</span>
                  <strong style={{ color: 'var(--color-amber)' }}>{recorrectionCount}</strong>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="panel-header">
                <h2>Smart Creation Engine</h2>
                <p className="panel-desc">Record voice, drag/drop files, or enter text instructions. Gemini will parse everything instantly.</p>
              </div>

              {/* Voice Input Zone */}
              <div className="voice-input-section">
                <label className="section-label">Voice Briefing</label>
                <div className={`voice-card ${isRecording ? 'recording' : ''}`}>
                  <div className="voice-visualizer">
                    {isRecording ? (
                      <div className="pulse-container">
                        <span className="pulse-ring"></span>
                        <span className="pulse-ring"></span>
                        <span className="pulse-ring"></span>
                        <Square size={24} className="mic-symbol animate-pulse" />
                      </div>
                    ) : (
                      <Mic size={24} className="mic-symbol" />
                    )}
                  </div>
                  <div className="voice-details">
                    {isRecording ? (
                      <>
                        <span className="voice-status text-recording">Recording Audio...</span>
                        <span className="voice-timer">{formatTime(recordingTime)}</span>
                      </>
                    ) : audioBlob ? (
                      <>
                        <span className="voice-status">Audio Recorded Successfully</span>
                        <button className="btn btn-audio-play" onClick={togglePlayAudioPreview}>
                          {isPlayingAudio ? <Pause size={14} /> : <Play size={14} />}
                          <span>{isPlayingAudio ? 'Pause' : 'Play Preview'}</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="voice-status">Capture Voice Description</span>
                        <span className="voice-help">Brief the requirements verbally</span>
                      </>
                    )}
                  </div>
                  <div className="voice-action">
                    {isRecording ? (
                      <button className="btn-mic-toggle stop" onClick={stopRecording}>
                        <Square size={16} />
                      </button>
                    ) : (
                      <button className="btn-mic-toggle start" onClick={startRecording}>
                        <Mic size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* File Upload Zone */}
              <div className="file-input-section">
                <label className="section-label">Assignment Assets (Images, PDFs, Word, Videos)</label>
                <div 
                  className={`dropzone ${dragActive ? 'active' : ''}`}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                >
                  <UploadCloud size={32} className="dropzone-icon" />
                  <p className="dropzone-text">
                    Drag and drop your files here or <span className="highlight-link">browse</span>
                  </p>
                  <span className="dropzone-help">Supports PDF, DOCX, TXT, PNG, JPG, MP3, MP4, etc.</span>
                  <input 
                    type="file" 
                    multiple 
                    className="file-hidden-input" 
                    onChange={handleFileChange}
                  />
                </div>

                {/* List of files pending upload */}
                {files.length > 0 && (
                  <div className="file-list">
                    {files.map((file, idx) => (
                      <div className="file-item-chip" key={idx}>
                        <FileText size={14} className="file-chip-icon" />
                        <span className="file-chip-name" title={file.name}>{file.name}</span>
                        <button className="file-chip-remove" onClick={() => removeFile(idx)}>
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Extra Notes / Text instructions */}
              <div className="instructions-section">
                <label className="section-label">Additional Instructions / Notes</label>
                <textarea
                  className="form-control"
                  rows={4}
                  placeholder="e.g. Include questions details, grading criteria, partner deadlines, or copy-paste text prompt..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </div>

              <button 
                className={`btn btn-primary btn-block btn-large btn-glow ${isProcessing ? 'loading' : ''}`}
                onClick={handleSmartAnalyze}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="spinner" size={18} />
                    <span>AI Analyzing Materials...</span>
                  </>
                ) : (
                  <>
                    <span>AI Smart Parse & Add</span>
                  </>
                )}
              </button>
            </>
          )}
        </section>

        {/* Board Panel (Right side) */}
        <section className="board-panel">
          <div className="board-header">
            <div className="search-wrap">
              <input 
                type="text" 
                className="form-control search-input" 
                placeholder="Search code, title, subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            {/* Mobile Column selector tabs */}
            <div className="mobile-column-tabs">
              <button 
                type="button"
                className={`mobile-tab-btn todo ${activeCol === 'todo' ? 'active' : ''}`}
                onClick={() => setActiveCol('todo')}
              >
                <span className="col-indicator todo"></span>
                <span>Todo ({todoList.length})</span>
              </button>
              <button 
                type="button"
                className={`mobile-tab-btn progress ${activeCol === 'progress' ? 'active' : ''}`}
                onClick={() => setActiveCol('progress')}
              >
                <span className="col-indicator progress"></span>
                <span>In Progress ({inProgressList.length})</span>
              </button>
              <button 
                type="button"
                className={`mobile-tab-btn recorrection ${activeCol === 'recorrection' ? 'active' : ''}`}
                onClick={() => setActiveCol('recorrection')}
              >
                <span className="col-indicator todo" style={{ backgroundColor: 'var(--color-amber)' }}></span>
                <span>Rework ({recorrectionList.length})</span>
              </button>
              <button 
                type="button"
                className={`mobile-tab-btn completed ${activeCol === 'submitted' ? 'active' : ''}`}
                onClick={() => setActiveCol('submitted')}
              >
                <span className="col-indicator done" style={{ backgroundColor: 'var(--color-emerald)' }}></span>
                <span>Submitted ({submittedList.length})</span>
              </button>
            </div>
          </div>

          <div className={`kanban-board show-${activeCol}`}>
            
            {/* Column: To Do */}
            <div className="kanban-column col-todo">
              <div className="column-header">
                <div className="col-title-wrap">
                  <span className="col-indicator todo"></span>
                  <h3>To Do</h3>
                </div>
                <span className="col-badge">{todoList.length}</span>
              </div>
              <div className="kanban-cards-container">
                {todoList.map(a => (
                  <AssignmentCard 
                    key={a.id} 
                    assignment={a} 
                    userRole={currentUser?.role}
                    onOpen={() => setSelectedAssignment(a)}
                    onStatusChange={(status) => updateStatus(a.id, status)}
                    getProgress={getProgressPercentage}
                  />
                ))}
                {todoList.length === 0 && <EmptyStateColumn />}
              </div>
            </div>

            {/* Column: In Progress */}
            <div className="kanban-column col-progress">
              <div className="column-header">
                <div className="col-title-wrap">
                  <span className="col-indicator progress"></span>
                  <h3>In Progress</h3>
                </div>
                <span className="col-badge">{inProgressList.length}</span>
              </div>
              <div className="kanban-cards-container">
                {inProgressList.map(a => (
                  <AssignmentCard 
                    key={a.id} 
                    assignment={a} 
                    userRole={currentUser?.role}
                    onOpen={() => setSelectedAssignment(a)}
                    onStatusChange={(status) => updateStatus(a.id, status)}
                    getProgress={getProgressPercentage}
                  />
                ))}
                {inProgressList.length === 0 && <EmptyStateColumn />}
              </div>
            </div>

            {/* Column: Re-correction */}
            <div className="kanban-column col-recorrection">
              <div className="column-header">
                <div className="col-title-wrap">
                  <span className="col-indicator progress" style={{ backgroundColor: 'var(--color-amber)', boxShadow: '0 0 8px var(--color-amber)' }}></span>
                  <h3>Re-correction</h3>
                </div>
                <span className="col-badge" style={{ borderColor: 'rgba(255, 153, 0, 0.2)', color: 'var(--color-amber)' }}>{recorrectionList.length}</span>
              </div>
              <div className="kanban-cards-container">
                {recorrectionList.map(a => (
                  <AssignmentCard 
                    key={a.id} 
                    assignment={a} 
                    userRole={currentUser?.role}
                    onOpen={() => setSelectedAssignment(a)}
                    onStatusChange={(status) => updateStatus(a.id, status)}
                    getProgress={getProgressPercentage}
                  />
                ))}
                {recorrectionList.length === 0 && <EmptyStateColumn />}
              </div>
            </div>

            {/* Column: Submitted */}
            <div className="kanban-column col-submitted">
              <div className="column-header">
                <div className="col-title-wrap">
                  <span className="col-indicator done" style={{ backgroundColor: 'var(--color-emerald)', boxShadow: '0 0 8px var(--color-emerald)' }}></span>
                  <h3>Submitted</h3>
                </div>
                <span className="col-badge" style={{ borderColor: 'rgba(0, 255, 135, 0.2)', color: 'var(--color-emerald)' }}>{submittedList.length}</span>
              </div>
              <div className="kanban-cards-container">
                {submittedList.map(a => (
                  <AssignmentCard 
                    key={a.id} 
                    assignment={a} 
                    userRole={currentUser?.role}
                    onOpen={() => setSelectedAssignment(a)}
                    onStatusChange={(status) => updateStatus(a.id, status)}
                    getProgress={getProgressPercentage}
                  />
                ))}
                {submittedList.length === 0 && <EmptyStateColumn />}
              </div>
            </div>

          </div>
        </section>

        </main>
      )}

      {/* --- MODALS --- */}

      {/* API Key settings modal */}
      {showSettings && (
        <div className="modal-overlay">
          <form className="modal-box glass-panel modal-small" onSubmit={saveSettings}>
            <div className="modal-header">
              <h3>Config Settings</h3>
              <button type="button" className="btn-close" onClick={() => setShowSettings(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="section-label">
                  <Key size={14} className="label-icon" />
                  <span>Gemini API Key</span>
                </label>
                <input 
                  type="password" 
                  className="form-control" 
                  placeholder="Enter AIzaSy..."
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  required
                />
                <p className="form-help">This key is saved locally in your browser storage and is never uploaded anywhere else.</p>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowSettings(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Settings</button>
            </div>
          </form>
        </div>
      )}

      {/* User Profile Modal (Change password self) */}
      {showProfileModal && (
        <div className="modal-overlay">
          <form className="modal-box glass-panel modal-small" onSubmit={handleChangePassword}>
            <div className="modal-header">
              <h3>My Profile</h3>
              <button type="button" className="btn-close" onClick={() => { setShowProfileModal(false); setProfileMsg(''); setProfileError(''); }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <div style={{ fontSize: '3rem' }}>👤</div>
                <h4 style={{ margin: '0.5rem 0 0.2rem' }}>{currentUser.name}</h4>
                <span className={`role-badge ${currentUser.role}`}>{currentUser.role.toUpperCase()}</span>
              </div>
              
              {profileMsg && <div className="alert alert-success">{profileMsg}</div>}
              {profileError && <div className="alert alert-error">{profileError}</div>}

              <div className="form-group">
                <label className="section-label">Current Password</label>
                <input 
                  type="password" 
                  className="form-control" 
                  value={curPassword}
                  onChange={(e) => setCurPassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="section-label">New Password</label>
                <input 
                  type="password" 
                  className="form-control" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="section-label">Confirm New Password</label>
                <input 
                  type="password" 
                  className="form-control" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => { setShowProfileModal(false); setProfileMsg(''); setProfileError(''); }}>Close</button>
              <button type="submit" className="btn btn-primary">Update Password</button>
            </div>
          </form>
        </div>
      )}

      {/* Admin User Management Modal */}
      {showUsersModal && (
        <div className="modal-overlay">
          <div className="modal-box glass-panel modal-medium">
            <div className="modal-header">
              <h3>User Accounts Administration</h3>
              <button className="btn-close" onClick={() => { setShowUsersModal(false); setUserAdminMsg(''); setUserAdminError(''); }}><X size={18} /></button>
            </div>
            
            <div className="modal-body">
              {userAdminMsg && <div className="alert alert-success">{userAdminMsg}</div>}
              {userAdminError && <div className="alert alert-error">{userAdminError}</div>}

              {/* Add user form */}
              <form className="glass-panel" onSubmit={handleCreateUser} style={{ padding: '1rem', borderStyle: 'dashed' }}>
                <h4 style={{ marginBottom: '0.75rem', fontSize: '0.95rem' }}>Create User Account</h4>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="section-label">Username</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="e.g. writer2" 
                      value={createUsername}
                      onChange={(e) => setCreateUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="section-label">Password</label>
                    <input 
                      type="password" 
                      className="form-control" 
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="form-grid-2" style={{ marginTop: '0.5rem' }}>
                  <div className="form-group">
                    <label className="section-label">Full Name</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="e.g. John Doe" 
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="section-label">Workspace Role</label>
                    <select 
                      className="form-control" 
                      value={createRole} 
                      onChange={(e) => setCreateRole(e.target.value)}
                    >
                      <option value="admin">Administrator</option>
                      <option value="creator">Assignment Creator (Add)</option>
                      <option value="writer">Assignment Writer (Do)</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary btn-block btn-glow" style={{ marginTop: '0.75rem' }}>
                  Add User
                </button>
              </form>

              {/* Users list */}
              <div style={{ marginTop: '1rem' }}>
                <h4 style={{ marginBottom: '0.5rem', fontSize: '0.95rem' }}>Active Accounts</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {usersList.map((user, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                      <div>
                        <strong style={{ fontSize: '0.85rem' }}>{user.name}</strong> 
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>({user.username})</span>
                        <div style={{ marginTop: '0.1rem' }}>
                          <span className={`role-badge ${user.role}`} style={{ fontSize: '0.65rem', padding: '0.05rem 0.35rem' }}>
                            {user.role}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => handleResetUserPassword(user.username)}>
                          Reset PW
                        </button>
                        <button type="button" className="btn btn-danger" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => handleDeleteUser(user.username)} disabled={user.username.toLowerCase() === currentUser.username.toLowerCase()}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => { setShowUsersModal(false); setUserAdminMsg(''); setUserAdminError(''); }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Manual creation modal */}
      {showManualForm && (
        <div className="modal-overlay">
          <div className="modal-box glass-panel modal-medium">
            <div className="modal-header">
              <h3>Add Assignment Manually</h3>
              <button className="btn-close" onClick={() => setShowManualForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleManualSubmit}>
              <div className="modal-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="section-label">Assignment Code</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="e.g. CS101, ENG202"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="section-label">Subject / Class</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="e.g. Software Engineering"
                      value={manualSubject}
                      onChange={(e) => setManualSubject(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="section-label">Assignment Title *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. Final Semester Report"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="section-label">Description / Instructions</label>
                  <textarea 
                    className="form-control" 
                    rows={4} 
                    placeholder="Write detailed rules..."
                    value={manualDesc}
                    onChange={(e) => setManualDesc(e.target.value)}
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="section-label">Due Date</label>
                    <input 
                      type="date" 
                      className="form-control" 
                      value={manualDueDate}
                      onChange={(e) => setManualDueDate(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="section-label">Estimated Effort</label>
                    <select 
                      className="form-control"
                      value={manualEffort}
                      onChange={(e) => setManualEffort(e.target.value)}
                    >
                      <option value="Easy">Easy (1-3 hours)</option>
                      <option value="Medium">Medium (4-10 hours)</option>
                      <option value="Hard">Hard (10+ hours)</option>
                    </select>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="section-label">Agreed Price (USD)</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      placeholder="e.g. 150" 
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="section-label">Payment Received (USD)</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      placeholder="e.g. 50" 
                      value={manualPriceReceived}
                      onChange={(e) => setManualPriceReceived(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="section-label">Tasks / Deliverables Checklist (one per line)</label>
                  <textarea 
                    className="form-control" 
                    rows={3} 
                    placeholder="e.g.&#10;Research guidelines&#10;Write python script&#10;Create PDF report"
                    value={manualTasksText}
                    onChange={(e) => setManualTasksText(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="section-label">Reference Documents & Materials</label>
                  <input 
                    type="file" 
                    multiple 
                    className="form-control" 
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setManualFiles(prev => [...prev, ...Array.from(e.target.files)]);
                      }
                    }}
                  />
                  {manualFiles.length > 0 && (
                    <div className="file-list" style={{ marginTop: '0.5rem' }}>
                      {manualFiles.map((file, idx) => (
                        <div className="file-item-chip" key={idx}>
                          <FileText size={14} className="file-chip-icon" />
                          <span className="file-chip-name" title={file.name}>{file.name}</span>
                          <button 
                            type="button" 
                            className="file-chip-remove" 
                            onClick={() => setManualFiles(prev => prev.filter((_, i) => i !== idx))}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowManualForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Assignment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assignment detail modal */}
      {selectedAssignment && (
        <div className="modal-overlay">
          <div className="modal-box glass-panel modal-large">
            
            {/* Modal Header */}
            <div className="modal-header">
              <div className="modal-title-area">
                <span className="tag-code">{selectedAssignment.code}</span>
                <span className="tag-subject">{selectedAssignment.subject}</span>
                {editingFields ? (
                  <div className="edit-headers">
                    <input 
                      type="text" 
                      className="form-control header-edit-input" 
                      value={editingFields.title}
                      onChange={(e) => setEditingFields({...editingFields, title: e.target.value})}
                    />
                    <div className="edit-code-subject-row">
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="Code" 
                        value={editingFields.code}
                        onChange={(e) => setEditingFields({...editingFields, code: e.target.value})}
                      />
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="Subject" 
                        value={editingFields.subject}
                        onChange={(e) => setEditingFields({...editingFields, subject: e.target.value})}
                      />
                    </div>
                  </div>
                ) : (
                  <h2>{selectedAssignment.title}</h2>
                )}
              </div>
              <div className="modal-actions-right">
                <div className="status-indicator-tag">
                  <span className={`col-indicator ${selectedAssignment.status.toLowerCase().replace(' ', '')}`}></span>
                  <span>{selectedAssignment.status}</span>
                </div>
                <button className="btn-close" onClick={() => { setSelectedAssignment(null); setEditingFields(null); }}><X size={18} /></button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="modal-body flex-row-layout">
              
              {/* Left Column: Description and files */}
              <div className="modal-left-column">
                
                {/* Meta details */}
                <div className="modal-meta-row">
                  <div className="meta-item">
                    <Calendar size={16} className="meta-icon" />
                    <div>
                      <span className="meta-lbl">Due Date</span>
                      {editingFields ? (
                        <input 
                          type="date" 
                          className="form-control inline-edit" 
                          value={editingFields.dueDate} 
                          onChange={(e) => setEditingFields({...editingFields, dueDate: e.target.value})} 
                        />
                      ) : (
                        <span className="meta-val">
                          {selectedAssignment.dueDate ? new Date(selectedAssignment.dueDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}) : 'No Deadline'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="meta-item">
                    <Clock size={16} className="meta-icon" />
                    <div>
                      <span className="meta-lbl">Effort Estimate</span>
                      {editingFields ? (
                        <input 
                          type="text" 
                          className="form-control inline-edit" 
                          value={editingFields.estimatedEffort} 
                          onChange={(e) => setEditingFields({...editingFields, estimatedEffort: e.target.value})} 
                        />
                      ) : (
                        <span className="meta-val">{selectedAssignment.estimatedEffort || 'Medium'}</span>
                      )}
                    </div>
                  </div>

                  <div className="meta-item">
                    <span style={{ fontSize: '1.2rem' }}>💰</span>
                    <div>
                      <span className="meta-lbl">Agreed Price</span>
                      {editingFields ? (
                        <input 
                          type="number" 
                          className="form-control inline-edit" 
                          value={editingFields.price} 
                          onChange={(e) => setEditingFields({...editingFields, price: e.target.value})} 
                        />
                      ) : (
                        <span className="meta-val" style={{ color: 'var(--color-emerald)' }}>
                          {selectedAssignment.price ? `$${Number(selectedAssignment.price).toLocaleString()}` : 'Not Set'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="meta-item">
                    <span style={{ fontSize: '1.2rem' }}>💳</span>
                    <div>
                      <span className="meta-lbl">Payment Received</span>
                      {editingFields ? (
                        <input 
                          type="number" 
                          className="form-control inline-edit" 
                          value={editingFields.priceReceived} 
                          onChange={(e) => setEditingFields({...editingFields, priceReceived: e.target.value})} 
                        />
                      ) : (
                        <span className="meta-val" style={{ color: 'var(--color-cyan)' }}>
                          {selectedAssignment.priceReceived ? `$${Number(selectedAssignment.priceReceived).toLocaleString()}` : '$0'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Re-correction Notes alert if present */}
                {selectedAssignment.recorrectionNotes && (
                  <div className={`alert ${selectedAssignment.status === 'Re-correction' ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: '1.25rem', borderStyle: 'dashed', background: selectedAssignment.status === 'Re-correction' ? 'rgba(255, 153, 0, 0.05)' : 'rgba(0, 255, 135, 0.03)', borderColor: selectedAssignment.status === 'Re-correction' ? 'var(--color-amber)' : 'var(--color-emerald)', color: selectedAssignment.status === 'Re-correction' ? '#ffaa00' : 'var(--color-emerald)' }}>
                    <AlertCircle size={20} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', textAlign: 'left' }}>
                      <strong>{selectedAssignment.status === 'Re-correction' ? '⚠️ Re-correction Requested:' : '✅ Correction Resolved:'}</strong>
                      <p style={{ fontSize: '0.85rem', margin: 0 }}>
                        {selectedAssignment.recorrectionNotes.replace('[RESOLVED] ', '')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Description details */}
                <div className="modal-desc-box">
                  <label className="section-label">Description & Rules</label>
                  {editingFields ? (
                    <textarea 
                      className="form-control edit-desc-textarea" 
                      rows={12} 
                      value={editingFields.description}
                      onChange={(e) => setEditingFields({...editingFields, description: e.target.value})}
                    />
                  ) : (
                    <div className="markdown-body">
                      {selectedAssignment.description ? (
                        selectedAssignment.description.split('\n').map((line, idx) => {
                          if (line.startsWith('# ')) return <h1 key={idx}>{line.replace('# ', '')}</h1>;
                          if (line.startsWith('## ')) return <h2 key={idx}>{line.replace('## ', '')}</h2>;
                          if (line.startsWith('### ')) return <h3 key={idx}>{line.replace('### ', '')}</h3>;
                          if (line.startsWith('- ')) return <li key={idx} className="md-li">{line.replace('- ', '')}</li>;
                          return <p key={idx}>{line}</p>;
                        })
                      ) : (
                        <p className="no-desc">No description available.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* 1. Assignment Reference Files */}
                <div className="attachments-section">
                  <label className="section-label">Assignment Reference Files</label>
                  
                  {selectedAssignment.attachments && selectedAssignment.attachments.length > 0 ? (
                    <div className="attachments-list">
                      {selectedAssignment.attachments.map((attach, idx) => (
                        <a 
                          key={idx} 
                          href={attach.path} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="attachment-link-card"
                        >
                          <File size={18} className="attach-icon" />
                          <div className="attach-info">
                            <span className="attach-name" title={attach.name}>{attach.name}</span>
                            <span className="attach-size">{attach.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}</span>
                          </div>
                          <ChevronRight size={16} className="attach-arrow" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="no-desc" style={{ marginBottom: '1rem' }}>No reference documents attached.</p>
                  )}

                  {/* Add more reference files selector (Hidden for Writer) */}
                  {currentUser.role !== 'writer' && (
                    <div className="add-attachments-row" style={{ marginTop: '1rem' }}>
                      <input 
                        type="file" 
                        multiple 
                        id="detail-ref-file-input"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            await handleUploadMoreFiles(selectedAssignment.id, e.target.files, 'attachments');
                          }
                        }}
                      />
                      <button 
                        type="button" 
                        className="btn btn-secondary btn-block"
                        style={{ borderStyle: 'dashed', borderWidth: '1.5px', background: 'rgba(255,255,255,0.02)' }}
                        onClick={() => document.getElementById('detail-ref-file-input').click()}
                      >
                        <UploadCloud size={16} />
                        <span>Attach More Reference Files</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. Submission Files */}
                <div className="attachments-section" style={{ marginTop: '1.5rem' }}>
                  <label className="section-label">Submission Deliverables</label>
                  
                  {selectedAssignment.submissions && selectedAssignment.submissions.length > 0 ? (
                    <div className="attachments-list">
                      {selectedAssignment.submissions.map((attach, idx) => (
                        <a 
                          key={idx} 
                          href={attach.path} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="attachment-link-card submission-card"
                        >
                          <File size={18} className="attach-icon" style={{ color: 'var(--color-emerald)' }} />
                          <div className="attach-info">
                            <span className="attach-name" title={attach.name}>{attach.name}</span>
                            <span className="attach-size">{attach.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}</span>
                          </div>
                          <ChevronRight size={16} className="attach-arrow" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="no-desc" style={{ marginBottom: '1rem' }}>No submissions uploaded yet.</p>
                  )}

                  {/* Add submission files selector (Hidden for Creator) */}
                  {currentUser.role !== 'creator' && (
                    <div className="add-attachments-row" style={{ marginTop: '1rem' }}>
                      <input 
                        type="file" 
                        multiple 
                        id="detail-sub-file-input"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            await handleUploadMoreFiles(selectedAssignment.id, e.target.files, 'submissions');
                          }
                        }}
                      />
                      <button 
                        type="button" 
                        className="btn btn-secondary btn-block"
                        style={{ borderStyle: 'dashed', borderWidth: '1.5px', background: 'rgba(255,255,255,0.02)', borderColor: 'var(--color-emerald)', color: 'var(--color-emerald)' }}
                        onClick={() => document.getElementById('detail-sub-file-input').click()}
                      >
                        <UploadCloud size={16} />
                        <span>Upload Finished Submissions</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Checklists and Actions */}
              <div className="modal-right-column">
                <div className="checklist-card glass-panel">
                  <div className="checklist-header">
                    <h4>Task Progress</h4>
                    <span className="checklist-progress-text">{getProgressPercentage(selectedAssignment.tasks)}%</span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="progress-bar-wrap">
                    <div 
                      className="progress-bar-fill" 
                      style={{ width: `${getProgressPercentage(selectedAssignment.tasks)}%` }}
                    ></div>
                  </div>

                  {/* Tasks items */}
                  <div className="checklist-items-list">
                    {selectedAssignment.tasks && selectedAssignment.tasks.length > 0 ? (
                      selectedAssignment.tasks.map(task => (
                        <div 
                          className={`checklist-item ${task.completed ? 'completed' : ''} ${currentUser.role === 'creator' ? 'disabled' : ''}`} 
                          key={task.id}
                          onClick={() => toggleSubTask(selectedAssignment, task.id)}
                        >
                          {task.completed ? (
                            <CheckCircle2 size={18} className="chk-icon checked" />
                          ) : (
                            <Circle size={18} className="chk-icon unchecked" />
                          )}
                          <span className="chk-text">{task.text}</span>
                        </div>
                      ))
                    ) : (
                      <p className="no-tasks">No tasks generated for this assignment.</p>
                    )}
                  </div>
                </div>

                {/* Workflow Actions Panel (Hidden for Creator) */}
                {currentUser.role !== 'creator' && !editingFields && (
                  <div className="workflow-actions-panel glass-panel" style={{ marginTop: '1rem', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assignment Workflow</h4>
                    
                    {/* If status is Todo */}
                    {selectedAssignment.status === 'Todo' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <button className="btn btn-primary btn-block" style={{ background: 'linear-gradient(135deg, var(--color-blue) 0%, var(--color-purple) 100%)', color: '#fff', boxShadow: 'none' }} onClick={() => updateStatus(selectedAssignment.id, 'In Progress')}>
                          <span>Start Working</span>
                        </button>
                        <button className="btn btn-primary btn-block" onClick={() => updateStatus(selectedAssignment.id, 'Submitted')}>
                          <span>Submit Assignment</span>
                        </button>
                      </div>
                    )}

                    {/* If status is In Progress */}
                    {selectedAssignment.status === 'In Progress' && (
                      <button className="btn btn-primary btn-block" onClick={() => updateStatus(selectedAssignment.id, 'Submitted')}>
                        <CheckCircle2 size={16} />
                        <span>Submit Assignment</span>
                      </button>
                    )}

                    {/* If status is Submitted */}
                    {selectedAssignment.status === 'Submitted' && (
                      <>
                        {isRaisingRecorrection ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <textarea 
                              className="form-control" 
                              rows={3} 
                              placeholder="Describe what corrections are required..." 
                              value={recorrectionFeedback} 
                              onChange={(e) => setRecorrectionFeedback(e.target.value)}
                              style={{ fontSize: '0.8rem' }}
                            />
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button type="button" className="btn btn-danger btn-block" style={{ fontSize: '0.8rem', padding: '0.5rem', background: 'var(--color-rose)', color: '#fff' }} onClick={async () => {
                                if (!recorrectionFeedback.trim()) {
                                  alert('Please enter correction details.');
                                  return;
                                }
                                try {
                                  const res = await apiFetch(`/api/assignments/${selectedAssignment.id}`, {
                                    method: 'PUT',
                                    body: JSON.stringify({
                                      status: 'Re-correction',
                                      recorrectionNotes: recorrectionFeedback
                                    })
                                  });
                                  if (res.ok) {
                                    const updated = await res.json();
                                    setAssignments(prev => prev.map(a => a.id === selectedAssignment.id ? updated : a));
                                    setSelectedAssignment(updated);
                                    setIsRaisingRecorrection(false);
                                  }
                                } catch (e) {
                                  console.error(e);
                                }
                              }}>
                                Submit Rework
                              </button>
                              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.5rem' }} onClick={() => setIsRaisingRecorrection(false)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button className="btn btn-danger btn-block" style={{ background: 'rgba(255, 153, 0, 0.15)', color: '#ffaa00', borderColor: 'rgba(255, 153, 0, 0.3)' }} onClick={() => setIsRaisingRecorrection(true)}>
                            <AlertCircle size={16} />
                            <span>Raise Re-correction</span>
                          </button>
                        )}
                      </>
                    )}

                    {/* If status is Re-correction */}
                    {selectedAssignment.status === 'Re-correction' && (
                      <button className="btn btn-primary btn-block" style={{ background: 'linear-gradient(135deg, var(--color-cyan) 0%, var(--color-emerald) 100%)', color: '#000' }} onClick={async () => {
                        try {
                          const res = await apiFetch(`/api/assignments/${selectedAssignment.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({
                              status: 'Submitted',
                              recorrectionNotes: `[RESOLVED] ${selectedAssignment.recorrectionNotes}`
                            })
                          });
                          if (res.ok) {
                            const updated = await res.json();
                            setAssignments(prev => prev.map(a => a.id === selectedAssignment.id ? updated : a));
                            setSelectedAssignment(updated);
                          }
                        } catch (e) {
                          console.error(e);
                        }
                      }}>
                        <CheckCircle2 size={16} />
                        <span>Re-correction Done</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Assignment Management operations (Hidden for Writer) */}
                {currentUser.role !== 'writer' && (
                  <div className="danger-actions-panel">
                    {editingFields ? (
                      <>
                        <button className="btn btn-primary btn-block" onClick={saveEditedDetails}>
                          Save Assignment Edits
                        </button>
                        <button className="btn btn-secondary btn-block" onClick={() => setEditingFields(null)}>
                          Cancel Edits
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-secondary btn-block" onClick={startEditingDetails}>
                          Edit Assignment Details
                        </button>
                        {currentUser.role === 'admin' && (
                          <button className="btn btn-danger btn-block" onClick={() => deleteAssignment(selectedAssignment.id)}>
                            <Trash2 size={16} />
                            <span>Delete Assignment</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Single Kanban card item component
function AssignmentCard({ assignment, userRole, onOpen, onStatusChange, getProgress }) {
  const progressVal = getProgress(assignment.tasks);
  
  const handleCycleStatus = (e) => {
    e.stopPropagation();
    // Only Writer or Admin can cycle status
    if (userRole === 'creator') return;

    const statuses = ['Todo', 'In Progress', 'Re-correction', 'Submitted'];
    const currentIdx = statuses.indexOf(assignment.status);
    const nextStatus = statuses[(currentIdx + 1) % statuses.length];
    onStatusChange(nextStatus);
  };

  return (
    <div className="kanban-card glass-panel" onClick={onOpen}>
      <div className="card-header">
        <span className="card-code">{assignment.code}</span>
        <span className="card-subject" title={assignment.subject}>{assignment.subject}</span>
      </div>
      <h4 className="card-title">{assignment.title}</h4>
      
      {assignment.dueDate && (
        <div className="card-duedate">
          <Calendar size={12} />
          <span>{new Date(assignment.dueDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</span>
        </div>
      )}

      {/* Progress tracker inside card */}
      <div className="card-progress">
        <div className="card-progress-lbl">
          <span>Progress</span>
          <span>{progressVal}%</span>
        </div>
        <div className="card-progress-track">
          <div className="card-progress-fill" style={{ width: `${progressVal}%` }}></div>
        </div>
      </div>

      <div className="card-footer">
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <span className="card-effort-badge">{assignment.estimatedEffort || 'Medium'}</span>
          {assignment.price && (
            <span className="card-effort-badge" style={{ background: 'rgba(0, 255, 135, 0.1)', color: 'var(--color-emerald)', borderColor: 'rgba(0, 255, 135, 0.2)' }}>
              ${Number(assignment.price).toLocaleString()}
            </span>
          )}
        </div>
        {userRole === 'creator' ? (
          <div className="read-only-status-badge">
            <span>{assignment.status}</span>
          </div>
        ) : (
          <button className="btn-cycle-status" onClick={handleCycleStatus} title="Change Status">
            <span>{assignment.status}</span>
            <ChevronRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// Column placeholder when no card is found
function EmptyStateColumn() {
  return (
    <div className="column-empty-state">
      <p>No assignments here</p>
    </div>
  );
}
