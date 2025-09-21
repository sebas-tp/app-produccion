import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, addDoc, onSnapshot, query, setDoc, doc, deleteDoc, getDoc } from "firebase/firestore";
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Configuración de Firebase (variables de entorno de Vercel)
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

const appId = process.env.REACT_APP_APP_ID || 'default-app-id';

// Inicializar Firebase
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
    const [loginForm, setLoginForm] = useState({ email: '', password: '' });
    const [selectedOperarioId, setSelectedOperarioId] = useState('');
    const [selectedFecha, setSelectedFecha] = useState('');
    const [editingRecord, setEditingRecord] = useState(null); // Para edición de registros

    // --- Lógica de Autenticación de Firebase y Carga de Datos ---
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                try {
                    const userDocRef = doc(db, 'roles', currentUser.uid);
                    const userDoc = await getDoc(userDocRef);
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        setUser({ ...currentUser, rol: userData.rol });
                    } else {
                        setUser({ ...currentUser, rol: 'operario' });
                    }
                } catch (error) {
                    console.error("Error al obtener el rol:", error);
                    signOut(auth);
                }
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
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
    
    // Lógica del login
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
            console.error("Error al iniciar sesión:", error.message);
            setMessage("Error al iniciar sesión. Verifica tu correo y contraseña.");
        } finally {
            setLoading(false);
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
                operarioEmail: user.email,
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

    // --- Funciones para exportar registros ---
    const handleExportExcel = () => {
        const exportData = records
            .filter(record =>
                (!selectedOperarioId || record.operarioId === selectedOperarioId) &&
                (!selectedFecha || record.fecha === selectedFecha)
            );
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Registros");
        const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        const data = new Blob([excelBuffer], { type: "application/octet-stream" });
        saveAs(data, "registros.xlsx");
    };

    const handleExportPDF = () => {
        const exportData = records
            .filter(record =>
                (!selectedOperarioId || record.operarioId === selectedOperarioId) &&
                (!selectedFecha || record.fecha === selectedFecha)
            );
        const docPDF = new jsPDF();
        docPDF.text("Registros de Producción", 10, 10);
        docPDF.autoTable({
            head: [['Operario', 'Fecha', 'Orden', 'Sector', 'Producto', 'Operación', 'Cantidad', 'Puntos', 'Observaciones']],
            body: exportData.map(r => [
                r.operarioEmail || r.operarioId,
                r.fecha,
                r.orden,
                r.sector,
                r.modeloProducto,
                r.operacion,
                r.cantidad,
                r.puntos,
                r.observaciones || ''
            ]),
            startY: 20,
            styles: { fontSize: 8 }
        });
        docPDF.save("registros.pdf");
    };

    // --- Renderizado de Paneles ---
    const renderOperatorPanel = () => (
        <div className="container mx-auto max-w-3xl p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl">
            {/* ...panel de operario igual que antes... */}
        </div>
    );

    // --- Panel de Administración con edición y exportación ---
    const renderAdminPanel = () => {
        // Obtener lista única de IDs de operarios y sus emails
        const operarioIds = Array.from(new Set(records.map(r => r.operarioId))).filter(Boolean);
        const operarios = operarioIds.map(id => {
            const rec = records.find(r => r.operarioId === id && r.operarioEmail);
            return { id, email: rec ? rec.operarioEmail : id };
        });
        const fechasUnicas = Array.from(new Set(records.map(r => r.fecha).filter(Boolean))).sort((a, b) => b.localeCompare(a));

        return (
            <div className="container mx-auto max-w-5xl p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full">
                {/* ...catálogos, puntos, etc... */}
                <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">Registros de Producción</h2>
                {/* Filtros por operario y fecha */}
                <div className="mb-4 flex flex-col md:flex-row md:space-x-4 space-y-2 md:space-y-0">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filtrar por Operario:</label>
                        <select
                            value={selectedOperarioId}
                            onChange={e => setSelectedOperarioId(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100"
                        >
                            <option value="">Todos</option>
                            {operarios.map(op => (
                                <option key={op.id} value={op.id}>{op.email}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filtrar por Fecha:</label>
                        <select
                            value={selectedFecha}
                            onChange={e => setSelectedFecha(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100"
                        >
                            <option value="">Todas</option>
                            {fechasUnicas.map(fecha => (
                                <option key={fecha} value={fecha}>{fecha}</option>
                            ))}
                        </select>
                    </div>
                </div>
                {/* Botones de exportación */}
                <div className="flex space-x-2 mb-2">
                    <button onClick={handleExportExcel} className="px-4 py-2 bg-green-600 text-white rounded">Descargar Excel</button>
                    <button onClick={handleExportPDF} className="px-4 py-2 bg-red-600 text-white rounded">Descargar PDF</button>
                </div>
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
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {records.length === 0 ? (
                                <tr>
                                    <td colSpan="10" className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-center">No hay registros de producción.</td>
                                </tr>
                            ) : (
                                records
                                    .filter(record =>
                                        (!selectedOperarioId || record.operarioId === selectedOperarioId) &&
                                        (!selectedFecha || record.fecha === selectedFecha)
                                    )
                                    .map((record) => (
                                        <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-800 dark:text-gray-200">
                                                {record.operarioEmail || (record.operarioId?.substring(0, 8) + '...') || 'N/A'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{record.fecha}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{record.orden}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{record.sector}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{record.modeloProducto}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{record.operacion}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{record.cantidad}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{record.puntos}</td>
                                            <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-300">{record.observaciones || 'N/A'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <button
                                                    onClick={() => setEditingRecord(record)}
                                                    className="text-indigo-600 hover:text-indigo-900 transition-colors"
                                                >
                                                    Editar
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                            )}
                        </tbody>
                    </table>
                </div>
                {/* Formulario de edición */}
                {editingRecord && (
                    <form
                        onSubmit={async (e) => {
                            e.preventDefault();
                            try {
                                await setDoc(
                                    doc(db, 'artifacts', appId, 'public', 'data', 'productionRecords', editingRecord.id),
                                    editingRecord
                                );
                                setMessage('Registro actualizado correctamente.');
                                setEditingRecord(null);
                            } catch (error) {
                                setMessage('Error al actualizar: ' + error.message);
                            }
                        }}
                        className="my-4 p-4 border rounded bg-gray-50 dark:bg-gray-700"
                    >
                        <h3 className="font-bold mb-2">Editar Registro</h3>
                        <input
                            type="text"
                            value={editingRecord.orden}
                            onChange={e => setEditingRecord({ ...editingRecord, orden: e.target.value })}
                            className="mb-2 p-2 border rounded w-full"
                            placeholder="Orden"
                        />
                        <input
                            type="text"
                            value={editingRecord.sector}
                            onChange={e => setEditingRecord({ ...editingRecord, sector: e.target.value })}
                            className="mb-2 p-2 border rounded w-full"
                            placeholder="Sector"
                        />
                        <input
                            type="text"
                            value={editingRecord.modeloProducto}
                            onChange={e => setEditingRecord({ ...editingRecord, modeloProducto: e.target.value })}
                            className="mb-2 p-2 border rounded w-full"
                            placeholder="Modelo Producto"
                        />
                        <input
                            type="text"
                            value={editingRecord.operacion}
                            onChange={e => setEditingRecord({ ...editingRecord, operacion: e.target.value })}
                            className="mb-2 p-2 border rounded w-full"
                            placeholder="Operación"
                        />
                        <input
                            type="number"
                            value={editingRecord.cantidad}
                            onChange={e => setEditingRecord({ ...editingRecord, cantidad: e.target.value })}
                            className="mb-2 p-2 border rounded w-full"
                            placeholder="Cantidad"
                        />
                        <input
                            type="number"
                            value={editingRecord.puntos}
                            onChange={e => setEditingRecord({ ...editingRecord, puntos: e.target.value })}
                            className="mb-2 p-2 border rounded w-full"
                            placeholder="Puntos"
                        />
                        <input
                            type="date"
                            value={editingRecord.fecha}
                            onChange={e => setEditingRecord({ ...editingRecord, fecha: e.target.value })}
                            className="mb-2 p-2 border rounded w-full"
                            placeholder="Fecha"
                        />
                        <textarea
                            value={editingRecord.observaciones}
                            onChange={e => setEditingRecord({ ...editingRecord, observaciones: e.target.value })}
                            className="mb-2 p-2 border rounded w-full"
                            placeholder="Observaciones"
                        />
                        <div className="flex space-x-2">
                            <button type="submit" className="mr-2 px-4 py-2 bg-green-600 text-white rounded">Guardar</button>
                            <button type="button" onClick={() => setEditingRecord(null)} className="px-4 py-2 bg-gray-400 text-white rounded">Cancelar</button>
                        </div>
                    </form>
                )}
            </div>
        );
    };

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

            {/* Si no hay usuario, muestra el formulario de login */}
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
