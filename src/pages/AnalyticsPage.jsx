import { useState, useEffect } from 'react';

// import Navbar from '../components/Layout/Navbar';
// import Footer from '../components/Layout/Footer';
import AnalyticsContainer from '../components/Analytics/AnalyticsContainer';
import { docuwareService } from '../services/docuwareService';

import { FaChartPie } from 'react-icons/fa';

const AnalyticsPage = () => {
    const [cabinets, setCabinets] = useState([]);
    const [selectedCabinetId, setSelectedCabinetId] = useState(localStorage.getItem('selectedCabinetId') || '');
    const [loadingCabinets, setLoadingCabinets] = useState(true);

    // Fetch cabinets on mount
    useEffect(() => {
        const fetchCabinets = async () => {
            try {
                const fetchedCabinets = await docuwareService.getCabinets();
                const sortedCabinets = fetchedCabinets.sort((a, b) => a.Name.localeCompare(b.Name));
                setCabinets(sortedCabinets);
                // Auto-selection removed
            } catch (error) {
                console.error('Error fetching cabinets:', error);
            } finally {
                setLoadingCabinets(false);
            }
        };

        fetchCabinets();
    }, []);

    const handleCabinetChange = (e) => {
        const newId = e.target.value;
        setSelectedCabinetId(newId);
        if (newId) {
            localStorage.setItem('selectedCabinetId', newId);
        } else {
            localStorage.removeItem('selectedCabinetId');
        }
    };

    return (
        <div className="flex flex-col h-full bg-base-200">
            <div className="flex-1 p-4 flex flex-col h-full overflow-hidden">
                <div className="flex items-center gap-3 mb-6">
                    <FaChartPie className="w-6 h-6 text-primary" />
                    <h1 className="text-3xl font-bold">Visual Analytics</h1>
                </div>

                <AnalyticsContainer
                    cabinetId={selectedCabinetId}
                    cabinets={cabinets}
                    onCabinetChange={handleCabinetChange}
                    loadingCabinets={loadingCabinets}
                />
            </div>
        </div>
    );
};

export default AnalyticsPage;
