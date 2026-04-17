// Equipment & Team icon registries — using @tabler/icons-react.
// Lucide-react continues to be used for all UI icons (buttons, nav, status);
// these registries are ONLY for the icon picker in category/team settings.

import {
    IconBackhoe,
    IconBulldozer,
    IconCrane,
    IconCarCrane,
    IconForklift,
    IconTractor,
    IconTruck,
    IconTruckDelivery,
    IconTruckLoading,
    IconTool,
    IconTools,
    IconHammer,
    IconShovel,
    IconBolt,
    IconGasStation,
    IconSettings2,
    IconBuilding,
    IconRoad,
    IconRuler,
    IconBucket,
    IconDroplet,
    IconPipeline,
    IconHelmet,
    IconUsersGroup,
    IconUser,
    IconShield,
    IconStar,
    IconHome,
    IconTarget,
    IconNut,
} from '@tabler/icons-react';

// ============================================================
// EQUIPMENT CATEGORY ICONS — construction machinery & transport
// ============================================================
export const EQUIPMENT_ICONS = {
    backhoe:        { component: IconBackhoe,       label: 'Экскаватор-погрузчик' },
    bulldozer:      { component: IconBulldozer,     label: 'Бульдозер' },
    crane:          { component: IconCrane,         label: 'Башенный кран' },
    carCrane:       { component: IconCarCrane,      label: 'Автокран' },
    forklift:       { component: IconForklift,      label: 'Погрузчик' },
    tractor:        { component: IconTractor,       label: 'Трактор' },
    truck:          { component: IconTruck,         label: 'Грузовик' },
    truckDelivery:  { component: IconTruckDelivery, label: 'Доставка' },
    truckLoading:   { component: IconTruckLoading,  label: 'Самосвал' },
    tool:           { component: IconTool,          label: 'Инструмент' },
    tools:          { component: IconTools,         label: 'Инструменты' },
    hammer:         { component: IconHammer,        label: 'Молоток' },
    shovel:         { component: IconShovel,        label: 'Лопата' },
    bolt:           { component: IconBolt,          label: 'Энергия' },
    gasStation:     { component: IconGasStation,    label: 'Топливо' },
    settings:       { component: IconSettings2,     label: 'Механизм' },
    building:       { component: IconBuilding,      label: 'Здание' },
    road:           { component: IconRoad,          label: 'Дорога' },
    ruler:          { component: IconRuler,         label: 'Геодезия' },
    bucket:         { component: IconBucket,        label: 'Ёмкость' },
    droplet:        { component: IconDroplet,       label: 'Водоснабжение' },
    pipeline:       { component: IconPipeline,      label: 'Трубопровод' },
    nut:            { component: IconNut,           label: 'Крепёж' },
};

// ============================================================
// TEAM / BRIGADE ICONS — people & organization
// ============================================================
export const TEAM_ICONS = {
    usersGroup: { component: IconUsersGroup, label: 'Бригада' },
    user:       { component: IconUser,       label: 'Работник' },
    helmet:     { component: IconHelmet,     label: 'Каска' },
    shield:     { component: IconShield,     label: 'Охрана' },
    star:       { component: IconStar,       label: 'Лучшие' },
    tool:       { component: IconTool,       label: 'Инструмент' },
    tools:      { component: IconTools,      label: 'Инструменты' },
    hammer:     { component: IconHammer,     label: 'Молоток' },
    crane:      { component: IconCrane,      label: 'Кран' },
    truck:      { component: IconTruck,      label: 'Транспорт' },
    home:       { component: IconHome,       label: 'Дом' },
    building:   { component: IconBuilding,   label: 'Здание' },
    bolt:       { component: IconBolt,       label: 'Энергетики' },
    droplet:    { component: IconDroplet,    label: 'Водоснабжение' },
    nut:        { component: IconNut,        label: 'Крепёж' },
    target:     { component: IconTarget,     label: 'Цель' },
};

// ============================================================
// Helpers (unchanged API — used by all consumers)
// ============================================================

export function getIconComponent(iconKey, registry = EQUIPMENT_ICONS) {
    if (!iconKey) return null;
    const entry = registry[iconKey];
    return entry ? entry.component : null;
}

export const DEFAULT_EQUIPMENT_ICON = 'settings';
export const DEFAULT_TEAM_ICON = 'usersGroup';
