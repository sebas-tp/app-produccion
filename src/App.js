import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, setLogLevel } from "firebase/app";
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, collection, addDoc, onSnapshot, query, setDoc, doc, deleteDoc } from "firebase/firestore";

// Configuración de Firebase (variables globales del entorno)
// eslint-disable-next-line no-undef
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
// eslint-disable-next-line no-undef
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
// eslint-disable-next-line no-undef
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Inicializar Firebase
setLogLevel('debug');
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Componente reutilizable para los dropdowns con búsqueda
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
    // --- Estados de la aplicación ---
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
        observaciones: ''
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

    // --- Lógica de Autenticación de Firebase y Carga de Datos ---
    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        const authenticate = async () => {
            try {
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (authError) {
                console.error("Error al autenticarse automáticamente:", authError);
                setMessage("Error al iniciar sesión automáticamente.");
                setLoading(false);
            }
        };
        authenticate();
        return () => unsubscribeAuth();
    }, []);

    // Cargar registros de producción
    useEffect(() => {
        if (!user || !showAdminPanel) return;

        const productionRecordsRef = collection(db, 'artifacts', appId, 'public', 'data', 'productionRecords');
        const q = query(productionRecordsRef);

        const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
            try {
                const fetchedRecords = [];
                snapshot.forEach(doc => {
                    fetchedRecords.push({ id: doc.id, ...doc.data() });
                });
                setRecords(fetchedRecords);
            } catch (snapshotError) {
                console.error("Error al obtener los registros de producción:", snapshotError);
            }
        }, (error) => {
            console.error("Error en la conexión a la base de datos:", error);
        });

        return () => unsubscribeSnapshot();
    }, [user, showAdminPanel]);

    // Cargar datos de puntos
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
                console.error("Error al obtener los datos de puntos:", snapshotError);
            }
        }, (error) => {
            console.error("Error en la conexión a la base de datos de puntos:", error);
        });
        return () => unsubscribePoints();
    }, []);

    // Cargar los catálogos de datos
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
            console.error("Error al cerrar sesión:", error.message);
        }
    };

    // --- Lógica del Panel del Operario ---
    const handleProductionFormChange = (e) => {
        const { name, value } = e.target;
        setProductionForm(prev => {
            const newForm = { ...prev, [name]: value };
            // Calcular puntos automáticamente
            const pointsEntry = pointsData.find(p => p.sector === newForm.sector && p.modeloProducto === newForm.modeloProducto && p.operacion === newForm.operacion);
            const points = pointsEntry ? pointsEntry.puntos : 0;
            newForm.puntos = points * (Number(newForm.cantidad) || 0);
            return newForm;
        });
    };

    const handleStartTask = () => {
        setTaskStartTime(new Date());
        setMessage('Tarea iniciada. Presiona "Fin de Tarea" al terminar.');
    };

    const handleEndTask = () => {
        if (!taskStartTime) {
            setMessage('Error: Tarea no iniciada.');
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
        setMessage(`Tarea finalizada. Duración: ${durationInMinutes} minutos. Ahora completa y envía el formulario.`);
    };

    const handleProductionSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        setIsSubmitting(true);
        try {
            const newRecord = {
                operarioId: user.uid,
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

            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'productionRecords'), newRecord);
            setMessage("Registro de producción guardado con éxito.");
            setProductionForm({
                orden: '',
                sector: sectors[0] || '',
                modeloProducto: '',
                operacion: '',
                cantidad: '',
                puntos: 0,
                fecha: new Date().toISOString().split('T')[0],
                observaciones: ''
            });
        } catch (error) {
            console.error("Error al guardar el registro:", error.message);
            setMessage("Error al guardar el registro: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Lógica del Panel de Administración para Puntos ---
    const handlePointsFormChange = (e) => {
        const { name, value } = e.target;
        setPointsForm(prev => ({ ...prev, [name]: value }));
    };

    const handlePointsSubmit = async (e) => {
        e.preventDefault();
        if (!pointsForm.sector || !pointsForm.modeloProducto || !pointsForm.operacion || pointsForm.puntos === '') {
            setMessage('Por favor, completa todos los campos del formulario de puntos.');
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
            setMessage("Puntos de producción guardados/actualizados con éxito.");
            setPointsForm({ id: '', sector: sectors[0] || '', modeloProducto: '', operacion: '', puntos: '' });
        } catch (error) {
            console.error("Error al guardar los puntos:", error);
            setMessage("Error al guardar los puntos: " + error.message);
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
        setMessage('Editando puntos. Modifica el formulario y haz clic en Guardar.');
    };

    const handleDeletePoints = async (id) => {
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pointsData', id));
            setMessage("Puntos eliminados con éxito.");
        } catch (error) {
            console.error("Error al eliminar los puntos:", error);
            setMessage("Error al eliminar los puntos: " + error.message);
        }
    };

    // --- Lógica de Gestión de Catálogos ---
    const handleCatalogFormChange = (e) => {
        const { name, value } = e.target;
        setCatalogForm(prev => ({ ...prev, [name]: value }));
    };

    const handleCatalogSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        const { type, value } = catalogForm;
        if (!value.trim()) {
            setMessage('El campo no puede estar vacío.');
            return;
        }
        try {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', type, value.trim());
            await setDoc(docRef, { name: value.trim() });
            setMessage(`"${value.trim()}" agregado/actualizado en el catálogo de ${type}.`);
            setCatalogForm({ ...catalogForm, value: '' });
            setEditingCatalogId(null);
        } catch (error) {
            console.error("Error al guardar en el catálogo:", error);
            setMessage("Error al guardar en el catálogo: " + error.message);
        }
    };

    const handleEditCatalog = (type, value) => {
        setCatalogForm({ type, value });
        setEditingCatalogId(value);
    };

    const handleDeleteCatalog = async (type, id) => {
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', type, id));
            setMessage(`Elemento eliminado del catálogo de ${type}.`);
        } catch (error) {
            console.error("Error al eliminar del catálogo:", error);
            setMessage("Error al eliminar del catálogo: " + error.message);
        }
    };

    // --- Renderizado de Paneles ---
    const renderOperatorPanel = () => (
        <div className="container mx-auto max-w-3xl p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl">
            <header className="flex justify-between items-center mb-6 border-b pb-4 border-gray-200 dark:border-gray-700">
                <div>
                    <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Panel del Operario</h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Bienvenido, <span className="font-mono text-gray-800 dark:text-gray-200">{user?.uid || 'Cargando...'}</span>
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
                        Registro de Producción
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
                        <li className="text-gray-500 dark:text-gray-400">No hay puntos de producción cargados.</li>
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
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">ID Operario</th>
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
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-800 dark:text-gray-200">{record.operarioId?.substring(0, 8) || 'N/A'}...</td>
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

    // --- Renderizado Principal ---
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

            {showAdminPanel ? renderAdminPanel() : renderOperatorPanel()}
        </div>
    );
}
