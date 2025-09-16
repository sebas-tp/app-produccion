import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, onSnapshot, query, setDoc, doc, deleteDoc, getDoc, getDocs } from "firebase/firestore";

// Firebase configuration (from Vercel environment variables)
const firebaseConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID
};

const appId = process.env.REACT_APP_APP_ID || 'default-app-id';


// --- Añade esta línea ---
console.log("El valor de appId es:", appId);

// ...el resto de tu código...

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Reusable component for searchable dropdowns
const SearchableDropdown = ({ options, value, onChange, name, label }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    const filteredOptions = options.filter(option =>
        option.toLowerCase().includes(searchTerm.toLowerCase())
    );

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);

    const handleSelectOption = (option) => {
        onChange({ target: { name, value: option } });
        setSearchTerm(option);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
            <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                placeholder="Escribe para buscar..."
                className="w-full mt-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100 transition-colors"
            />
            {isOpen && (
                <ul className="absolute z-10 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md mt-1 max-h-60 overflow-y-auto shadow-lg">
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((option, index) => (
                            <li
                                key={index}
                                onClick={() => handleSelectOption(option)}
                                className="px-4 py-2 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-600 transition-colors"
                            >
                                {option}
                            </li>
                        ))
                    ) : (
                        <li className="px-4 py-2 text-gray-500 dark:text-gray-400">No hay coincidencias</li>
                    )}
                </ul>
            )}
        </div>
    );
};

export default function App() {
    // --- Application states ---
    const [user, setUser] = useState(null);
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showAdminPanel, setShowAdminPanel] = useState(false);
    const [records, setRecords] = useState([]);
    const [pointsData, setPointsData] = useState([]);
    const [sectors, setSectors] = useState([]);
    const [products, setProducts] = useState([]);
    const [operations, setOperations] = useState([]);

    const [productionForm, setProductionForm] = useState({
        orden: '',
        sector: '',
        modeloProducto: '',
        operacion: '',
        cantidad: '',
        puntos: 0,
        fecha: new Date().toISOString().split('T')[0],
        observaciones: '',
        horarioInicio: '', // Added this field
        horarioFin: '' // Added this field
    });
    const [taskStartTime, setTaskStartTime] = useState(null);
    const [pointsForm, setPointsForm] = useState({
        id: '',
        sector: '',
        modeloProducto: '',
        operacion: '',
        puntos: ''
    });

    const [catalogForm, setCatalogForm] = useState({ type: 'sectors', value: '' });
    const [editingCatalogId, setEditingCatalogId] = useState(null);
    const [loginForm, setLoginForm] = useState({ email: '', password: '' });

    // --- Firebase Authentication and Data Loading Logic ---
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                try {
                    const userDocRef = doc(db, 'roles', currentUser.uid);
                    const userDoc = await getDoc(userDocRef);
                    const userData = userDoc.exists() ? userDoc.data() : { rol: 'operario' };

                    const profileDocRef = doc(db, 'userProfile', currentUser.uid); // Changed to userProfile (singular)
                    const profileDoc = await getDoc(profileDocRef);
                    const profileData = profileDoc.exists() ? profileDoc.data() : { name: currentUser.email };

                    setUser({ ...currentUser, rol: userData.rol, name: profileData.name });
                } catch (error) {
                    console.error("Error getting role or profile:", error);
                    signOut(auth);
                }
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Load production records for the admin
    useEffect(() => {
        if (!user || user.rol !== 'admin') return;

        const fetchAllRecords = async () => {
            const allRecords = [];
            try {
                const userRecordsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'productionRecordsByUser');
                // --- AÑADE ESTA LÍNEA AQUÍ ---
                console.log("El administrador está buscando en la ruta:", userRecordsCollectionRef.path);
                const userDocs = await getDocs(userRecordsCollectionRef);
                // --- AÑADE ESTA LÍNEA AQUÍ ---
                console.log("Cantidad de usuarios encontrados para leer registros:", userDocs.docs.length);

                for (const userDoc of userDocs.docs) {
                    const dailyRecordsCollectionRef = collection(userRecordsCollectionRef, userDoc.id, 'dailyRecords');
                    const dailyRecords = await getDocs(dailyRecordsCollectionRef);
                    dailyRecords.forEach(doc => {
                        const data = doc.data();
                        data.records.forEach(record => {
                            allRecords.push({
                                ...record,
                                id: `${userDoc.id}-${doc.id}-${record.timestamp}`, // Unique ID for the frontend
                                operarioId: userDoc.id,
                                operarioName: data.operarioName
                            });
                        });
                    });
                }
                setRecords(allRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
            } catch (error) {
                console.error("Error fetching admin records:", error);
            }
        };

        fetchAllRecords();
        const unsubscribe = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'productionRecordsByUser'), (snapshot) => {
            fetchAllRecords();
        }, (error) => {
            console.error("Error in snapshot listener for admin records:", error);
        });

        return () => unsubscribe();
    }, [user]);

    // Load points data
    useEffect(() => {
        const pointsRef = collection(db, 'artifacts', appId, 'public', 'data', 'pointsData');
        const unsubscribePoints = onSnapshot(pointsRef, (snapshot) => {
            try {
                const fetchedPoints = [];
                snapshot.forEach(doc => {
                    fetchedPoints.push({ id: doc.id, ...doc.data() });
                });
                setPointsData(fetchedPoints);
            } catch (snapshotError) {
                console.error("Error getting points data:", snapshotError);
            }
        }, (error) => {
            console.error("Error connecting to points database:", error);
        });
        return () => unsubscribePoints();
    }, []);

    // Load catalog data
    useEffect(() => {
        const unsubscribeSectors = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'sectors'), (snapshot) => {
            const list = snapshot.docs.map(doc => doc.data().name);
            setSectors(list);
        });

        const unsubscribeProducts = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'products'), (snapshot) => {
            const list = snapshot.docs.map(doc => doc.data().name);
            setProducts(list);
        });

        const unsubscribeOperations = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'operations'), (snapshot) => {
            const list = snapshot.docs.map(doc => doc.data().name);
            setOperations(list);
        });

        return () => {
            unsubscribeSectors();
            unsubscribeProducts();
            unsubscribeOperations();
        };
    }, []);

    const handleLogout = async () => {
        setMessage('');
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error signing out:", error.message);
        }
    };

    // Login logic
    const handleLoginChange = (e) => {
        const { name, value } = e.target;
        setLoginForm(prev => ({ ...prev, [name]: value }));
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setMessage('');
        setLoading(true);
        try {
            await signInWithEmailAndPassword(auth, loginForm.email, loginForm.password);
            setLoginForm({ email: '', password: '' });
        } catch (error) {
            console.error("Error signing in:", error.message);
            setMessage("Error al iniciar sesión. Verifica tu correo y contraseña.");
        } finally {
            setLoading(false);
        }
    };

    // --- Operator Panel Logic ---
    const handleProductionFormChange = (e) => {
        const { name, value } = e.target;
        setProductionForm(prev => {
            const newForm = { ...prev, [name]: value };
            // Calculate points automatically
            const pointsEntry = pointsData.find(p => p.sector === newForm.sector && p.modeloProducto === newForm.modeloProducto && p.operacion === newForm.operacion);
            const points = pointsEntry ? pointsEntry.puntos : 0;
            newForm.puntos = points * (Number(newForm.cantidad) || 0);
            return newForm;
        });
    };

    const handleStartTask = () => {
        setTaskStartTime(new Date());
        setMessage('Task started. Press "End Task" when finished.');
    };

    const handleEndTask = () => {
        if (!taskStartTime) {
            setMessage('Error: Task not started.');
            return;
        }
        const endTime = new Date();
        const startTime = taskStartTime;
        const durationInMinutes = Math.floor((endTime - startTime) / 60000);

        const startTimeFormatted = startTime.toTimeString().split(' ')[0];
        const endTimeFormatted = endTime.toTimeString().split(' ')[0];

        setProductionForm(prev => ({
            ...prev,
            horarioInicio: startTimeFormatted,
            horarioFin: endTimeFormatted
        }));

        setTaskStartTime(null);
        setMessage(`Task finished. Duration: ${durationInMinutes} minutes. Now complete and submit the form.`);
    };

    const handleProductionSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        setIsSubmitting(true);

        // Check for required fields before submitting
        if (!productionForm.horarioInicio || !productionForm.horarioFin) {
            setMessage("Error: Debes iniciar y finalizar la tarea antes de guardar el registro.");
            setIsSubmitting(false);
            return;
        }

        try {
            const record = {
                orden: productionForm.orden,
                sector: productionForm.sector,
                operacion: productionForm.operacion,
                fecha: productionForm.fecha,
                horarioInicio: productionForm.horarioInicio,
                horarioFin: productionForm.horarioFin,
                modeloProducto: productionForm.modeloProducto,
                cantidad: Number(productionForm.cantidad),
                puntos: Number(productionForm.puntos),
                observaciones: productionForm.observaciones,
                timestamp: new Date().toISOString()
            };

            const dailyRecordDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'productionRecordsByUser', user.uid, 'dailyRecords', productionForm.fecha);
            // --- AÑADE ESTA LÍNEA AQUÍ ---
            console.log("El operario está guardando en la ruta:", dailyRecordDocRef.path);
            const dailyRecordDoc = await getDoc(dailyRecordDocRef);
            
            const existingRecords = dailyRecordDoc.exists() ? dailyRecordDoc.data().records : [];
            const newRecordsList = [...existingRecords, record];
            
            await setDoc(dailyRecordDocRef, { records: newRecordsList, operarioName: user.name, timestamp: new Date().toISOString() }, { merge: true });

            setMessage("Record saved successfully.");
            setProductionForm({
                orden: '',
                sector: '',
                modeloProducto: '',
                operacion: '',
                cantidad: '',
                puntos: 0,
                fecha: new Date().toISOString().split('T')[0],
                observaciones: '',
                horarioInicio: '', // Resetting the field to an empty string
                horarioFin: '' // Resetting the field to an empty string
            });
        } catch (error) {
            console.error("Error saving the record:", error.message);
            setMessage("Error saving the record: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Admin Panel Logic for Points ---
    const handlePointsFormChange = (e) => {
        const { name, value } = e.target;
        setPointsForm(prev => ({ ...prev, [name]: value }));
    };

    const handlePointsSubmit = async (e) => {
        e.preventDefault();
        if (!pointsForm.sector || !pointsForm.modeloProducto || !pointsForm.operacion || pointsForm.puntos === '') {
            setMessage('Please fill in all points form fields.');
            return;
        }
        setMessage('');
        try {
            const docId = `${pointsForm.sector}-${pointsForm.modeloProducto}-${pointsForm.operacion}`;
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'pointsData', docId);
            await setDoc(docRef, {
                sector: pointsForm.sector,
                modeloProducto: pointsForm.modeloProducto,
                operacion: pointsForm.operacion,
                puntos: Number(pointsForm.puntos)
            });
            setMessage("Production points saved/updated successfully.");
            setPointsForm({ id: '', sector: sectors[0] || '', modeloProducto: '', operacion: '', puntos: '' });
        } catch (error) {
            console.error("Error saving points:", error);
            setMessage("Error saving points: " + error.message);
        }
    };

    const handleEditPoints = (point) => {
        setPointsForm({
            id: point.id,
            sector: point.sector,
            modeloProducto: point.modeloProducto,
            operacion: point.operacion,
            puntos: point.puntos
        });
        setMessage('Editing points. Modify the form and click Save.');
    };

    const handleDeletePoints = async (id) => {
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pointsData', id));
            setMessage("Points deleted successfully.");
        } catch (error) {
            console.error("Error deleting points:", error);
            setMessage("Error deleting points: " + error.message);
        }
    };

    // --- Catalog Management Logic ---
    const handleCatalogFormChange = (e) => {
        const { name, value } = e.target;
        setCatalogForm(prev => ({ ...prev, [name]: value }));
    };

    const handleCatalogSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        const { type, value } = catalogForm;
        if (!value.trim()) {
            setMessage('The field cannot be empty.');
            return;
        }
        try {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', type, value.trim());
            await setDoc(docRef, { name: value.trim() });
            setMessage(`"${value.trim()}" added/updated to the ${type} catalog.`);
            setCatalogForm({ ...catalogForm, value: '' });
            setEditingCatalogId(null);
        } catch (error) {
            console.error("Error saving to catalog:", error);
            setMessage("Error saving to catalog: " + error.message);
        }
    };

    const handleEditCatalog = (type, value) => {
        setCatalogForm({ type, value });
        setEditingCatalogId(value);
    };

    const handleDeleteCatalog = async (type, id) => {
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', type, id));
            setMessage(`Item deleted from the ${type} catalog.`);
        } catch (error) {
            console.error("Error deleting from catalog:", error);
            setMessage("Error deleting from catalog: " + error.message);
        }
    };

    // --- Panel Rendering ---
    const renderOperatorPanel = () => (
        <div className="container mx-auto max-w-3xl p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl">
            <header className="flex justify-between items-center mb-6 border-b pb-4 border-gray-200 dark:border-gray-700">
                <div>
                    <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Panel del Operario</h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Bienvenido, <span className="font-mono text-gray-800 dark:text-gray-200">{user?.name || user?.email || 'Cargando...'}</span>
                    </p>
                </div>
                <button onClick={handleLogout} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors">
                    Cerrar Sesión
                </button>
            </header>

            {message && <div className="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 p-4 rounded-md mb-6 transition-opacity duration-300">{message}</div>}

            <form onSubmit={handleProductionSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Número de la Orden</label>
                        <input type="text" name="orden" value={productionForm.orden} onChange={handleProductionFormChange} required
                            className="w-full mt-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100 transition-colors" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Sector</label>
                        <select name="sector" value={productionForm.sector} onChange={handleProductionFormChange} required
                            className="w-full mt-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100 transition-colors">
                            <option value="">Selecciona un sector</option>
                            {sectors.map(sector => (<option key={sector} value={sector}>{sector}</option>))}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fecha</label>
                    <input type="date" name="fecha" value={productionForm.fecha} onChange={handleProductionFormChange} required
                        className="w-full mt-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100 transition-colors" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Registro de Tarea</label>
                        <div className="flex space-x-2 mt-1">
                            {!taskStartTime ? (
                                <button type="button" onClick={handleStartTask}
                                    className="flex-1 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors">
                                    Inicio de Tarea
                                </button>
                            ) : (
                                <button type="button" onClick={handleEndTask}
                                    className="flex-1 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors">
                                    Fin de Tarea
                                </button>
                            )}
                        </div>
                        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            {productionForm.horarioInicio && productionForm.horarioFin && (
                                <p>Duración: {productionForm.horarioInicio} - {productionForm.horarioFin}</p>
                            )}
                        </div>
                    </div>

                    <SearchableDropdown
                        options={products}
                        value={productionForm.modeloProducto}
                        onChange={handleProductionFormChange}
                        name="modeloProducto"
                        label="Modelo del Producto"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SearchableDropdown
                        options={operations}
                        value={productionForm.operacion}
                        onChange={handleProductionFormChange}
                        name="operacion"
                        label="Operación"
                    />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cantidad</label>
                        <input type="number" name="cantidad" value={productionForm.cantidad} onChange={handleProductionFormChange} required
                            className="w-full mt-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100 transition-colors" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Puntos</label>
                    <input type="number" name="puntos" value={productionForm.puntos} readOnly disabled
                        className="w-full mt-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md cursor-not-allowed dark:bg-gray-700 dark:text-gray-400 transition-colors" />
                </div>


                <div className="col-span-1 md:col-span-2">
                    <label htmlFor="observaciones" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Observaciones</label>
                    <textarea id="observaciones" name="observaciones" rows="3" value={productionForm.observaciones} onChange={handleProductionFormChange}
                        className="w-full mt-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100 transition-colors"></textarea>
                </div>

                <button type="submit" disabled={isSubmitting || taskStartTime}
                    className="w-full flex justify-center py-3 px-4 border border-transparent text-lg font-bold rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {isSubmitting ? 'Guardando...' : 'Guardar Registro'}
                </button>
            </form>
        </div>
    );

    const renderAdminPanel = () => (
        <div className="container mx-auto max-w-5xl p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full">
            <header className="flex justify-between items-center mb-6 border-b pb-4 border-gray-200 dark:border-gray-700">
                <div>
                    <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Panel de Administración</h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Bienvenido, <span className="font-mono text-gray-800 dark:text-gray-200">{user?.name || user?.email || 'Cargando...'}</span>
                    </p>
                </div>
                <button onClick={handleLogout} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors">
                    Cerrar Sesión
                </button>
            </header>

            {message && <div className="bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 p-4 rounded-md mb-6">{message}</div>}

            <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">Gestionar Puntos de Producción</h2>
            <form onSubmit={handlePointsSubmit} className="space-y-4 mb-8 p-4 border border-gray-300 dark:border-gray-600 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Sector</label>
                        <select name="sector" value={pointsForm.sector} onChange={handlePointsFormChange} required
                            className="w-full mt-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100 transition-colors">
                            <option value="">Selecciona un sector</option>
                            {sectors.map(sector => (<option key={sector} value={sector}>{sector}</option>))}
                        </select>
                    </div>
                    <SearchableDropdown
                        options={products}
                        value={pointsForm.modeloProducto}
                        onChange={handlePointsFormChange}
                        name="modeloProducto"
                        label="Modelo del Producto"
                    />
                    <SearchableDropdown
                        options={operations}
                        value={pointsForm.operacion}
                        onChange={handlePointsFormChange}
                        name="operacion"
                        label="Operación"
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Puntos</label>
                        <input type="number" name="puntos" value={pointsForm.puntos} onChange={handlePointsFormChange} step="0.01" required
                            className="w-full mt-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100 transition-colors" />
                    </div>
                    <div className="flex items-end">
                        <button type="submit" className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 transition-colors">
                            {pointsForm.id ? 'Actualizar Puntos' : 'Añadir Puntos'}
                        </button>
                    </div>
                </div>
            </form>

            <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">Puntos de Producción Cargados</h2>
            <div className="p-4 border border-gray-300 dark:border-gray-600 rounded-lg mb-8">
                <ul className="space-y-2">
                    {pointsData.length > 0 ? (
                        pointsData.map(point => (
                            <li key={point.id} className="flex items-center justify-between bg-gray-100 dark:bg-gray-700 p-2 rounded-md">
                                <span className="text-sm">
                                    <span className="font-bold">{point.sector}</span> + <span className="font-bold">{point.modeloProducto}</span> + <span className="font-bold">{point.operacion}</span> = <span className="text-indigo-600 dark:text-indigo-400 font-bold">{point.puntos}</span>
                                </span>
                                <div>
                                    <button onClick={() => handleEditPoints(point)} className="text-indigo-600 hover:text-indigo-900 transition-colors mr-2">Editar</button>
                                    <button onClick={() => handleDeletePoints(point.id)} className="text-red-600 hover:text-red-900 transition-colors">Eliminar</button>
                                </div>
                            </li>
                        ))
                    ) : (
                        <li className="px-4 py-2 text-gray-500 dark:text-gray-400">No hay puntos de producción cargados.</li>
                    )}
                </ul>
            </div>

            <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">Gestionar Catálogos</h2>
            <div className="p-4 border border-gray-300 dark:border-gray-600 rounded-lg mb-8">
                <form onSubmit={handleCatalogSubmit} className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
                    <select name="type" value={catalogForm.type} onChange={handleCatalogFormChange}
                        className="flex-1 w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100 transition-colors">
                        <option value="sectors">Sectores</option>
                        <option value="products">Modelos de Producto</option>
                        <option value="operations">Operaciones</option>
                    </select>
                    <input type="text" name="value" value={catalogForm.value} onChange={handleCatalogFormChange} placeholder="Escribe para añadir o editar"
                        className="flex-1 w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100 transition-colors" />
                    <button type="submit" className="w-full md:w-auto px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors">
                        {editingCatalogId ? 'Actualizar' : 'Añadir'}
                    </button>
                </form>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="catalog-list">
                        <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2">Sectores</h3>
                        <ul className="space-y-2">
                            {sectors.map(item => (
                                <li key={item} className="flex items-center justify-between bg-gray-100 dark:bg-gray-700 p-2 rounded-md">
                                    <span className="text-sm">{item}</span>
                                    <div>
                                        <button onClick={() => handleEditCatalog('sectors', item)} className="text-indigo-600 hover:text-indigo-900 transition-colors mr-2">Editar</button>
                                        <button onClick={() => handleDeleteCatalog('sectors', item)} className="text-red-600 hover:text-red-900 transition-colors">Eliminar</button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="catalog-list">
                        <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2">Modelos de Producto</h3>
                        <ul className="space-y-2">
                            {products.map(item => (
                                <li key={item} className="flex items-center justify-between bg-gray-100 dark:bg-gray-700 p-2 rounded-md">
                                    <span className="text-sm">{item}</span>
                                    <div>
                                        <button onClick={() => handleEditCatalog('products', item)} className="text-indigo-600 hover:text-indigo-900 transition-colors mr-2">Editar</button>
                                        <button onClick={() => handleDeleteCatalog('products', item)} className="text-red-600 hover:text-red-900 transition-colors">Eliminar</button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="catalog-list">
                        <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2">Operaciones</h3>
                        <ul className="space-y-2">
                            {operations.map(item => (
                                <li key={item} className="flex items-center justify-between bg-gray-100 dark:bg-gray-700 p-2 rounded-md">
                                    <span className="text-sm">{item}</span>
                                    <div>
                                        <button onClick={() => handleEditCatalog('operations', item)} className="text-indigo-600 hover:text-indigo-900 transition-colors mr-2">Editar</button>
                                        <button onClick={() => handleDeleteCatalog('operations', item)} className="text-red-600 hover:text-red-900 transition-colors">Eliminar</button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">Registros de Producción</h2>
            <div className="table-container scrollbar-hide">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Operario</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fecha</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Orden</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Sector</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Producto</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Operación</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Cantidad</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Puntos</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Observaciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {records.length === 0 ? (
                            <tr>
                                <td colSpan="9" className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-center">No hay registros de producción.</td>
                            </tr>
                        ) : (
                            records.map((record) => (
                                <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-800 dark:text-gray-200">{record.operarioName || 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{record.fecha}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{record.orden}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{record.sector}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{record.modeloProducto}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{record.operacion}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{record.cantidad}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{record.puntos}</td>
                                    <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-300">{record.observaciones || 'N/A'}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    // --- Main Rendering ---
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
                <p className="text-gray-800 dark:text-gray-200 text-lg">Cargando...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 font-sans flex flex-col items-center">
            <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                body { font-family: 'Inter', sans-serif; }
                .table-container { max-height: 80vh; overflow-y: auto; }
                .scrollbar-hide::-webkit-scrollbar { display: none; } .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
                .catalog-list ul {
                    max-height: 250px;
                    overflow-y: auto;
                    border: 1px solid #e5e7eb;
                    border-radius: 0.375rem;
                }
                .dark .catalog-list ul {
                    border: 1px solid #4b5563;
                }
                `}
            </style>

            {/* If no user, show login form */}
            {!user ? (
                <div className="container mx-auto max-w-sm p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl">
                    <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4 text-center">Iniciar Sesión</h1>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Correo Electrónico</label>
                            <input type="email" name="email" value={loginForm.email} onChange={handleLoginChange} required
                                className="w-full mt-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Contraseña</label>
                            <input type="password" name="password" value={loginForm.password} onChange={handleLoginChange} required
                                className="w-full mt-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100" />
                        </div>
                        <button type="submit" className="w-full py-2 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
                            Ingresar
                        </button>
                    </form>
                    {message && <div className="mt-4 text-red-500 text-sm text-center">{message}</div>}
                </div>
            ) : (
                // If there's a user, show the panel based on their role
                <>
                    <div className="flex space-x-4 mb-8">
                        <button
                            onClick={() => setShowAdminPanel(false)}
                            className={`px-6 py-2 rounded-md font-bold transition-colors ${!showAdminPanel ? 'bg-indigo-600 text-white' : 'bg-gray-300 text-gray-800 hover:bg-gray-400'}`}
                        >
                            Panel de Operario
                        </button>
                        <button
                            onClick={() => setShowAdminPanel(true)}
                            className={`px-6 py-2 rounded-md font-bold transition-colors ${showAdminPanel ? 'bg-indigo-600 text-white' : 'bg-gray-300 text-gray-800 hover:bg-gray-400'}`}
                        >
                            Panel de Administrador
                        </button>
                    </div>

                    {showAdminPanel && user.rol === 'admin' ? renderAdminPanel() : renderOperatorPanel()}
                </>
            )}
        </div>
    );
}
