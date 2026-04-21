import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useConfirm from '../../../hooks/useConfirm';
import useEquipDefaultTime from '../../../hooks/useEquipDefaultTime';

/**
 * Custom hook encapsulating all form state and handlers for the application
 * create/edit flow. Accepts the external dependencies it needs and returns
 * the full form state + every handler that modals / the page consume.
 *
 * @param {object} params
 * @param {string}   params.tgId
 * @param {object}   params.data          - dashboard data (teams, equipment, kanban_apps, …)
 * @param {array}    params.objectsList   - list of active objects
 * @param {array}    params.smartDates    - array produced by getSmartDates()
 * @param {Function} params.setGlobalCreateAppOpen
 * @param {Function} params.fetchData     - refresh dashboard
 * @param {boolean}  params.isGlobalCreateAppOpen
 */
export default function useAppForm({
    tgId,
    data,
    objectsList,
    smartDates,
    setGlobalCreateAppOpen,
    fetchData,
    isGlobalCreateAppOpen,
}) {
    const { confirm, ConfirmUI } = useConfirm();
    const defaultTime = useEquipDefaultTime();

    const emptyForm = () => ({
        id: null,
        status: '',
        date_target: smartDates[1].val,
        object_id: '',
        object_address: '',
        team_ids: [],
        team_name: '',
        members: [],
        members_data: [],
        equipment: [],
        comment: '',
        isViewOnly: false,
        foreman_id: null,
        foreman_name: '',
        is_team_freed: 0,
        freed_team_ids: [],
    });

    const [appForm, setAppForm] = useState(emptyForm());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [teamMembers, setTeamMembers] = useState([]);
    const [activeEqCategory, setActiveEqCategory] = useState(null);

    // Reset form every time the global create-modal is opened
    useEffect(() => {
        if (isGlobalCreateAppOpen) {
            setAppForm(emptyForm());
            setActiveEqCategory(null);
            setTeamMembers([]);
            setIsSubmitting(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGlobalCreateAppOpen]);

    // Fetch team members whenever the selected team list OR the target
    // date changes. Passing date + exclude_app_id lets the backend mark
    // members already booked in another app that date — the picker then
    // shows them disabled with a "Занят" label instead of hiding them.
    useEffect(() => {
        if (appForm.team_ids && appForm.team_ids.length > 0) {
            const params = new URLSearchParams();
            if (appForm.date_target) params.set('date', appForm.date_target);
            if (appForm.id) params.set('exclude_app_id', String(appForm.id));
            const qs = params.toString() ? `?${params.toString()}` : '';
            Promise.all(appForm.team_ids.map(id => axios.get(`/api/teams/${id}/details${qs}`)))
                .then(responses => {
                    const allMembers = responses.flatMap(res => {
                        const tid = res.data?.id;
                        const tname = res.data?.name || '';
                        return (res.data?.members || []).map(m => ({ ...m, team_id: tid, team_name: tname }));
                    });
                    const uniqueMembers = Array.from(
                        new Map(allMembers.map(m => [m.id, m])).values()
                    );
                    setTeamMembers(uniqueMembers);
                    if (!appForm.isViewOnly && !appForm.id) {
                        // Pre-select only members that aren't already booked
                        // elsewhere on this date. Users can still untick them.
                        const freeIds = uniqueMembers
                            .filter(m => !m.is_used)
                            .map(m => m.id);
                        setAppForm(prev => ({ ...prev, members: freeIds }));
                    }
                })
                .catch(() => setTeamMembers([]));
        } else {
            setTeamMembers([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appForm.team_ids.join(','), appForm.date_target, appForm.id]);

    // -------------------------------------------------------------------------
    // Basic field helpers
    // -------------------------------------------------------------------------

    const handleFormChange = (field, value) => {
        if (!appForm.isViewOnly) setAppForm(prev => ({ ...prev, [field]: value }));
    };

    const handleObjectSelect = async (objectId) => {
        const selObj = objectsList.find(o => o.id === parseInt(objectId));
        setAppForm(prev => ({
            ...prev,
            object_id: objectId,
            object_address: selObj ? `${selObj.name} (${selObj.address})` : '',
        }));
        if (objectId) {
            try {
                const fd = new FormData();
                fd.append('object_id', objectId);
                await axios.post(`/api/users/${tgId}/last_objects`, fd);
            } catch (e) {}
        }
    };

    // -------------------------------------------------------------------------
    // Team / member toggles
    // -------------------------------------------------------------------------

    const toggleTeamSelection = (id) => {
        if (appForm.isViewOnly) return;
        setAppForm(prev => {
            const newIds = prev.team_ids.includes(id)
                ? prev.team_ids.filter(x => x !== id)
                : [...prev.team_ids, id];
            return { ...prev, team_ids: newIds };
        });
    };

    const toggleAppMember = (id) => {
        if (appForm.isViewOnly) return;
        // Block toggling members that are already booked in another
        // application on the same date — the picker shows them disabled
        // but a stray click shouldn't bypass that.
        const target = teamMembers.find(m => m.id === id);
        if (target?.is_used) {
            toast.error(
                target.used_in_object
                    ? `Уже занят: заявка №${target.used_in_app_id} · ${target.used_in_object}`
                    : `Уже занят в заявке №${target.used_in_app_id}`
            );
            return;
        }
        setAppForm(prev => ({
            ...prev,
            members: prev.members?.includes(id)
                ? prev.members.filter(m => m !== id)
                : [...(prev.members || []), id],
        }));
    };

    /** Select every non-used member of a given team, preserving other
     *  team picks. Exposed for the "Выбрать всех свободных" shortcut in
     *  the partial-brigade picker. */
    const selectAllFreeInTeam = (teamId) => {
        if (appForm.isViewOnly) return;
        const freeIds = teamMembers
            .filter(m => m.team_id === teamId && !m.is_used)
            .map(m => m.id);
        setAppForm(prev => {
            const keep = (prev.members || []).filter(mid => {
                const mm = teamMembers.find(x => x.id === mid);
                return !mm || mm.team_id !== teamId;
            });
            return { ...prev, members: [...keep, ...freeIds] };
        });
    };

    // -------------------------------------------------------------------------
    // Equipment toggles / time updates
    // -------------------------------------------------------------------------

    const toggleEquipmentSelection = (equip) => {
        if (appForm.isViewOnly) return;
        setAppForm(prev => {
            const exists = prev.equipment.find(e => e.id === equip.id);
            if (exists) return { ...prev, equipment: prev.equipment.filter(e => e.id !== equip.id) };
            const displayName = equip.driver
                ? `${equip.name} [${equip.license_plate || 'нет г.н.'}] (${equip.driver})`
                : `${equip.name} [${equip.license_plate || 'нет г.н.'}]`;
            return { ...prev, equipment: [...prev.equipment, { id: equip.id, name: displayName, time_start: defaultTime.start, time_end: defaultTime.end }] };
        });
    };

    const updateEquipmentTime = (id, field, value) => {
        if (!appForm.isViewOnly)
            setAppForm(prev => ({
                ...prev,
                equipment: prev.equipment.map(e => (e.id === id ? { ...e, [field]: value } : e)),
            }));
    };

    // -------------------------------------------------------------------------
    // Availability checkers
    // -------------------------------------------------------------------------

    const checkTeamStatus = (team_id) => {
        // v2.4.4: partial-brigade aware.
        //   free    — no other app on this date references the team.
        //   partial — another app picks SPECIFIC members of this team;
        //             the remaining members are free to use here.
        //   busy    — another app uses the whole team (empty
        //             selected_members), so nothing is left.
        if (!data.kanban_apps) return { state: 'free' };
        const appsOnDate = data.kanban_apps.filter(
            a => a.date_target === appForm.date_target &&
                !['rejected', 'cancelled', 'completed'].includes(a.status)
        );
        let partialHit = null;
        for (const a of appsOnDate) {
            if (appForm.id === a.id) continue;
            const tIds = a.team_id ? String(a.team_id).split(',').map(Number) : [];
            if (!tIds.includes(team_id)) continue;
            const otherSelected = a.selected_members
                ? String(a.selected_members).split(',').map(s => Number(s.trim())).filter(Boolean)
                : [];
            if (otherSelected.length === 0) {
                return {
                    state: 'busy',
                    message: `Бригада полностью занята в этот день на объекте:\n📍 ${a.object_address}`,
                };
            }
            partialHit = partialHit || {
                state: 'partial',
                message: `Бригада частично занята (заявка №${a.id} · ${a.object_address}). Свободных рабочих можно выбрать.`,
            };
        }
        return partialHit || { state: 'free' };
    };

    const checkEquipStatus = (equip) => {
        if (equip.status === 'repair') return { state: 'repair', message: 'Техника в ремонте.' };
        if (data.kanban_apps) {
            const appsOnDate = data.kanban_apps.filter(
                a => a.date_target === appForm.date_target &&
                    !['rejected', 'cancelled', 'completed'].includes(a.status)
            );
            for (const a of appsOnDate) {
                try {
                    const eqList = JSON.parse(a.equipment_data || '[]');
                    if (eqList.some(eqq => eqq.id === equip.id) && appForm.id !== a.id)
                        return { state: 'busy', message: `Занята на объекте:\n📍 ${a.object_address}` };
                } catch (e) {}
            }
        }
        return { state: 'free' };
    };

    // -------------------------------------------------------------------------
    // Apply defaults from object config
    // -------------------------------------------------------------------------

    const handleApplyDefaults = async (type) => {
        const selectedObj = objectsList.find(o => o.id === parseInt(appForm.object_id));
        if (!selectedObj) return;

        const targetTeams = type === 'teams' ? selectedObj.default_team_ids : '';
        const targetEquips = type === 'equip' ? selectedObj.default_equip_ids : '';

        if (!targetTeams && !targetEquips) {
            toast.error('Для этого объекта не назначены ресурсы по умолчанию.');
            return;
        }

        try {
            const fd = new FormData();
            fd.append('date_target', appForm.date_target);
            fd.append('object_id', selectedObj.id);
            fd.append('team_ids', type === 'teams' ? targetTeams : appForm.team_ids.join(','));

            const equipDataForCheck =
                type === 'equip'
                    ? JSON.stringify(targetEquips.split(',').map(id => ({ id: parseInt(id) })))
                    : JSON.stringify(appForm.equipment);
            fd.append('equip_data', equipDataForCheck);

            const res = await axios.post('/api/applications/check_availability', fd);

            if (res.data.status === 'occupied') {
                toast.error(`Ошибка занятости: ${res.data.message}`);
            } else {
                if (type === 'teams') {
                    const ids = targetTeams.split(',').map(Number);
                    setAppForm(prev => ({ ...prev, team_ids: ids }));
                }
                if (type === 'equip') {
                    const ids = targetEquips.split(',').map(Number);
                    const newEq = data.equipment
                        .filter(e => ids.includes(e.id))
                        .map(e => ({
                            id: e.id,
                            name: e.driver
                                ? `${e.name} [${e.license_plate || 'нет г.н.'}] (${e.driver})`
                                : `${e.name} [${e.license_plate || 'нет г.н.'}]`,
                            time_start: defaultTime.start,
                            time_end: defaultTime.end,
                        }));
                    setAppForm(prev => ({ ...prev, equipment: newEq }));
                }
                toast.success('Ресурсы успешно подставлены!');
            }
        } catch (e) {
            toast.error('Ошибка связи с сервером при проверке занятости.');
        }
    };

    // -------------------------------------------------------------------------
    // Cross-brigade SMR check
    // -------------------------------------------------------------------------

    const [crossBrigadeWarnings, setCrossBrigadeWarnings] = useState([]);
    const [showCrossBrigadeModal, setShowCrossBrigadeModal] = useState(false);

    const checkCrossBrigadeMembers = () => {
        // Per-team warnings: "Вы выбрали часть бригады X без бригадира".
        // Triggered when ≥1 member of a brigade is picked but the brigade's
        // brigadier (is_foreman) is not included. SMR for that partial group
        // can then only be filled by the foreman.
        const warnings = [];
        const teamIdSet = new Set(appForm.team_ids);

        for (const tid of teamIdSet) {
            const membersOfTeam = teamMembers.filter(m => m.team_id === tid);
            if (membersOfTeam.length === 0) continue;
            const selectedFromTeam = membersOfTeam.filter(m => appForm.members.includes(m.id));
            const brigadier = membersOfTeam.find(m => m.is_foreman);

            if (
                selectedFromTeam.length > 0 &&
                brigadier &&
                !appForm.members.includes(brigadier.id)
            ) {
                const tname = membersOfTeam[0]?.team_name || `#${tid}`;
                warnings.push({
                    team: { id: tid, name: tname },
                    members: selectedFromTeam.filter(m => !m.is_foreman),
                    selectedCount: selectedFromTeam.filter(m => !m.is_foreman).length,
                    totalCount: membersOfTeam.filter(m => !m.is_foreman).length,
                });
            }
        }
        return warnings;
    };

    // -------------------------------------------------------------------------
    // Create / update application
    // -------------------------------------------------------------------------

    const handleCreateApp = async (e) => {
        e.preventDefault();
        if (appForm.isViewOnly) { setGlobalCreateAppOpen(false); return; }
        if (!appForm.object_id) return toast.error('Выберите объект!');
        if (appForm.team_ids.length === 0 && appForm.equipment.length === 0 && !appForm.pendingExchange)
            return toast.error('Выберите бригаду или технику!');
        if (appForm.team_ids.length === 0) {
            const ok = await confirm('Создать заявку ТОЛЬКО на технику (без людей)?', {
                title: 'Подтверждение', variant: 'warning', confirmText: 'Да, создать',
            });
            if (!ok) return;
        }
        if (appForm.team_ids.length > 0 && appForm.members.length === 0)
            return toast.error('Выберите хотя бы одного рабочего из бригады!');

        // Cross-brigade warning check
        const cbWarnings = checkCrossBrigadeMembers();
        if (cbWarnings.length > 0) {
            setCrossBrigadeWarnings(cbWarnings);
            setShowCrossBrigadeModal(true);
            return;
        }

        await _doSubmit();
    };

    const confirmCrossBrigade = async () => {
        setShowCrossBrigadeModal(false);
        setCrossBrigadeWarnings([]);
        await _doSubmit();
    };

    const _doSubmit = async () => {
        setIsSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('date_target', appForm.date_target);
            fd.append('object_id', appForm.object_id);
            fd.append('object_address', appForm.object_address);
            fd.append('team_id', appForm.team_ids.join(',') || '0');
            fd.append('comment', appForm.comment);
            fd.append('selected_members', appForm.members.join(','));
            fd.append('equipment_data', JSON.stringify(appForm.equipment));

            if (appForm.id) {
                await axios.post(`/api/applications/${appForm.id}/update`, fd);
                toast.success('Заявка успешно обновлена!');
            } else {
                const createRes = await axios.post('/api/applications/create', fd);
                toast.success('Успешно отправлено на модерацию!');

                // Send deferred exchange request if pending
                if (appForm.pendingExchange && createRes.data?.id) {
                    try {
                        const exRes = await axios.post('/api/exchange/request', {
                            requester_app_id: createRes.data.id,
                            requested_equip_id: appForm.pendingExchange.requested_equip_id,
                            offered_equip_id: appForm.pendingExchange.offered_equip_id,
                        });
                        if (exRes.data.success) {
                            toast.success('Запрос на обмен техники отправлен!');
                        } else {
                            toast.error(exRes.data.error || 'Ошибка отправки обмена');
                        }
                    } catch (exErr) {
                        toast.error(exErr.response?.data?.error || 'Не удалось отправить запрос на обмен');
                    }
                }
            }
            setGlobalCreateAppOpen(false);
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Ошибка сохранения');
        } finally {
            setIsSubmitting(false);
        }
    };

    // -------------------------------------------------------------------------
    // Delete application
    // -------------------------------------------------------------------------

    const handleDeleteApp = async () => {
        const ok = await confirm(
            'ВНИМАНИЕ! Вы уверены, что хотите полностью УДАЛИТЬ эту заявку из системы? Это действие необратимо!',
            { title: 'Удаление заявки', variant: 'danger', confirmText: 'Удалить' }
        );
        if (!ok) return;
        setIsSubmitting(true);
        try {
            await axios.post(`/api/applications/${appForm.id}/delete`);
            toast.success('Заявка успешно удалена!');
            setGlobalCreateAppOpen(false);
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Ошибка при удалении заявки.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        // state
        appForm,
        setAppForm,
        isSubmitting,
        setIsSubmitting,
        teamMembers,
        activeEqCategory,
        setActiveEqCategory,
        // handlers
        handleFormChange,
        handleObjectSelect,
        handleApplyDefaults,
        toggleTeamSelection,
        toggleAppMember,
        selectAllFreeInTeam,
        toggleEquipmentSelection,
        updateEquipmentTime,
        checkTeamStatus,
        checkEquipStatus,
        handleCreateApp,
        handleDeleteApp,
        // cross-brigade warning
        crossBrigadeWarnings,
        showCrossBrigadeModal,
        setShowCrossBrigadeModal,
        confirmCrossBrigade,
        // confirm dialog node (must be rendered by the consuming component)
        ConfirmUI,
    };
}
