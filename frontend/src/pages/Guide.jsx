import { useNavigate, Link } from 'react-router-dom';

export default function Guide() {
  const navigate = useNavigate();

  const SectionTitle = ({ icon, title }) => (
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center mb-4 mt-8 border-b dark:border-gray-700 pb-2">
          <span className="text-3xl mr-3">{icon}</span> {title}
      </h2>
  );

  const Block = ({ title, children }) => (
      <div className="bg-white dark:bg-gray-800/50 p-5 rounded-xl border border-gray-200 dark:border-gray-700 mb-4 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-lg font-bold text-blue-700 dark:text-blue-400 mb-3">{title}</h3>
          <div className="text-gray-600 dark:text-gray-300 text-sm md:text-base space-y-2 leading-relaxed">
              {children}
          </div>
      </div>
  );

  const ActionLink = ({ to, text }) => (
      <Link to={to} className="inline-block mt-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold px-4 py-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-sm border border-blue-200 dark:border-blue-800">
          Перейти к {text} ➔
      </Link>
  );

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen text-gray-800 dark:text-gray-100 p-4 sm:p-8 transition-colors duration-200 font-sans">
      <div className="max-w-5xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-10 mt-2 border border-transparent dark:border-gray-700">

        {/* ШАПКА */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 border-b dark:border-gray-700 pb-6 gap-4 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-blue-600 dark:text-blue-400 flex items-center">
            <span className="mr-3 text-4xl">📖</span> База знаний
          </h1>
          <button onClick={() => navigate(-1)} className="px-5 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl font-bold transition-colors shadow-sm border border-gray-200 dark:border-gray-600">
            ⬅ Назад
          </button>
        </div>

        <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
            Добро пожаловать в справочное руководство <b>«ВИКС Расписание»</b>. Здесь подробно описаны все возможности Web-платформы для каждой должности, а также инструкции по установке на телефон.
        </p>

        {/* 1. РЕГИСТРАЦИЯ И ВХОД */}
        <SectionTitle icon="🔐" title="Регистрация и Вход в систему" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Block title="Вход через Telegram (Web)">
                <p>Откройте сайт в любом браузере. Нажмите на синюю кнопку <b>«Log in with Telegram»</b>.</p>
                <p>Если вы заходите впервые, система попросит ввести системный пароль. Пароль выдается руководством и определяет вашу должность (Прораб, Модератор и т.д.).</p>
                <ActionLink to="/" text="странице входа" />
            </Block>

            <Block title="Вход через Telegram Mini App (Бот)">
                <p>В Telegram-боте нажмите кнопку <b>«📱 Открыть платформу»</b>. Приложение откроется прямо внутри мессенджера без необходимости вводить логин.</p>
                <p>При первом входе также может потребоваться системный пароль.</p>
            </Block>

            <Block title="Вход по приглашению (Для рабочих)">
                <p>Рабочим <b>не нужен пароль</b>. Прораб генерирует специальную ссылку и отправляет её в чат.</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>Перейдите по ссылке от прораба.</li>
                    <li>Авторизуйтесь через Telegram.</li>
                    <li>Выберите своё ФИО из предложенного списка бригады.</li>
                    <li>Подтвердите выбор, и ваш аккаунт будет автоматически привязан!</li>
                </ul>
            </Block>

            <Block title="Мой профиль и Аватар">
                <p>В правом верхнем углу нажмите кнопку <b>«Профиль»</b>. Здесь вы можете изменить свою фотографию (вставив URL-ссылку на картинку), а также просмотреть свою историю действий.</p>
                <p>Изменение ФИО и должности доступно только руководству.</p>
            </Block>
        </div>

        {/* 2. РУКОВОДСТВО ПО РОЛЯМ */}
        <SectionTitle icon="🎭" title="Права доступа и Роли" />
        <div className="space-y-4">
            <Block title="👷‍♂️ Рабочий бригады">
                <p>Базовая роль. Рабочий может просматривать <b>Действующий наряд</b> своей бригады (объект, время, техника). Также рабочий получает автоматические уведомления в бота, если заявка утверждена.</p>
                <ActionLink to="/dashboard" text="Дашборду" />
            </Block>

            <Block title="🏗 Прораб">
                <p>Управляет людьми на объектах. Основные права:</p>
                <ul className="list-disc pl-5 space-y-1 mt-2">
                    <li>Создание новых бригад.</li>
                    <li>Добавление людей в бригаду и назначение <b>⭐️ Бригадиров</b>.</li>
                    <li>Генерация пригласительных ссылок для привязки рабочих к платформе.</li>
                    <li><b>Создание заявок на выезд</b> (с выбором даты, адреса, техники и конкретных людей).</li>
                </ul>
            </Block>

            <Block title="🛡 Модератор">
                <p>Отвечает за проверку корректности нарядов. Основные права:</p>
                <ul className="list-disc pl-5 space-y-1 mt-2">
                    <li>Доступ к панели <b>«Заявки на рассмотрении»</b>.</li>
                    <li>Одобрение (✅) или Отклонение (❌) заявок от прорабов.</li>
                    <li>Массовая отправка одобренных нарядов в рабочий Telegram-чат.</li>
                </ul>
            </Block>

            <Block title="👔 Руководитель (Boss) и Супер-Админ">
                <p>Полный контроль над всей платформой:</p>
                <ul className="list-disc pl-5 space-y-1 mt-2">
                    <li>Просмотр детальной статистики (Одобрено/Отклонено/Ожидают).</li>
                    <li><b>Панель управления техникой:</b> добавление автопарка (по одной или массово списком), отправка техники «В ремонт».</li>
                    <li><b>CRM Пользователей:</b> Редактирование ФИО, Ролей и Бригад любых сотрудников. Полное удаление аккаунтов.</li>
                    <li>Доступ к глобальному <b>Журналу действий (Логам)</b> системы.</li>
                </ul>
            </Block>
        </div>

        {/* 3. РАБОТА С ЗАЯВКАМИ И БРИГАДАМИ */}
        <SectionTitle icon="📝" title="Работа с Бригадами и Заявками" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Block title="Как создать бригаду и добавить людей?">
                <ol className="list-decimal pl-5 mt-2 space-y-1">
                    <li>Нажмите <b>«+ Создать новую бригаду»</b> и введите название.</li>
                    <li>Возле созданной бригады нажмите <b>«Управлять»</b>.</li>
                    <li>В открывшемся окне впишите ФИО рабочего и его должность. Если это старший смены — поставьте галочку <i>«Назначить бригадиром»</i>.</li>
                    <li>Нажмите <b>«🔗 Ссылка»</b> и отправьте её рабочим. При переходе они сами выберут своё имя из списка.</li>
                </ol>
            </Block>

            <Block title="Как создать заявку на выезд?">
                <p>Прораб нажимает <b>«📝 Создать заявку»</b> и заполняет форму:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li><b>Дата и Адрес:</b> Для удобства есть быстрые кнопки «Сегодня/Завтра».</li>
                    <li><b>Бригада:</b> При выборе бригады появляется список её участников. Выделите только тех, кто поедет на объект.</li>
                    <li><b>Техника:</b> Выберите категорию, затем саму машину. Можно выбрать сразу несколько машин! Для каждой появится ползунок установки времени (с ... до ...).</li>
                    <li>Нажмите «Отправить заявку».</li>
                </ul>
            </Block>

            <Block title="Как работает Модерация?">
                <p>Все новые заявки падают в статус <span className="text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded text-xs">Ожидает проверки</span>. Модератор проверяет данные и нажимает ✅.</p>
                <p>Как только заявка одобрена, на главной кнопке <b>«📤 Отправить наряды в группу»</b> появляется красный счетчик. Нажатие этой кнопки формирует красивый текст и отправляет все одобренные наряды в Telegram.</p>
            </Block>

            <Block title="Управление Автопарком (Для Админов)">
                <p>Вы можете добавлять новую технику по одной, указывая категорию, название и ФИО водителя. Либо использовать вкладку <b>«Массово»</b>, просто скопировав список из Excel.</p>
                <p>Если машина сломалась, нажмите кнопку <b>«В ремонт»</b> — она сразу же исчезнет из формы создания заявки у прорабов, чтобы предотвратить ошибки планирования.</p>
            </Block>
        </div>

        {/* 4. УСТАНОВКА PWA (ДОБАВЛЕНИЕ НА ГЛАВНЫЙ ЭКРАН) */}
        <SectionTitle icon="📱" title="Установка на экран телефона (Приложение)" />
        <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-xl border border-blue-200 dark:border-blue-800 shadow-sm mb-8">
            <p className="mb-6 text-gray-700 dark:text-gray-300">
                Вы можете установить нашу платформу прямо на рабочий стол вашего смартфона. Она будет открываться как полноценное приложение на весь экран (без адресной строки браузера). Выберите ваше устройство и браузер ниже:
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* БЛОК IOS */}
                <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="font-bold text-xl text-gray-900 dark:text-white flex items-center mb-4 border-b dark:border-gray-700 pb-2">
                        🍎 Устройства Apple (iOS)
                    </h3>
                    <p className="font-semibold text-blue-700 dark:text-blue-400 mb-2">Браузер Safari (Рекомендуется):</p>
                    <ol className="list-decimal pl-5 space-y-3 text-sm text-gray-700 dark:text-gray-300">
                        <li>Откройте сайт платформы в браузере <b>Safari</b>.</li>
                        <li>В самом низу экрана по центру найдите и нажмите значок <b>«Поделиться»</b> (выглядит как квадрат со стрелочкой, направленной вверх ⬆️).</li>
                        <li>В открывшемся меню прокрутите немного вниз и выберите пункт <b>«На экран "Домой"»</b> (рядом будет иконка квадрата с плюсиком ➕).</li>
                        <li>В правом верхнем углу нажмите синюю кнопку <b>«Добавить»</b>.</li>
                        <li className="font-medium text-green-600 dark:text-green-400">Готово! Иконка системы появится среди других ваших приложений.</li>
                    </ol>
                </div>

                {/* БЛОК ANDROID */}
                <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="font-bold text-xl text-gray-900 dark:text-white flex items-center mb-4 border-b dark:border-gray-700 pb-2">
                        🤖 Устройства Android
                    </h3>

                    <div className="space-y-5">
                        {/* Chrome */}
                        <div>
                            <p className="font-semibold text-blue-700 dark:text-blue-400 mb-1">Google Chrome:</p>
                            <ol className="list-decimal pl-5 text-sm text-gray-700 dark:text-gray-300 space-y-1">
                                <li>Нажмите на <b>Три точки (⋮)</b> в правом верхнем углу браузера.</li>
                                <li>В меню выберите пункт <b>«Добавить на главный экран»</b>.</li>
                                <li>Подтвердите действие, нажав <b>«Добавить»</b>.</li>
                            </ol>
                        </div>

                        {/* Yandex */}
                        <div>
                            <p className="font-semibold text-blue-700 dark:text-blue-400 mb-1">Яндекс Браузер:</p>
                            <ol className="list-decimal pl-5 text-sm text-gray-700 dark:text-gray-300 space-y-1">
                                <li>Нажмите на <b>Три точки (⋮)</b> в адресной строке (или три полоски внизу).</li>
                                <li>Выберите пункт <b>«Добавить на домашний экран»</b> (иногда называется «Ярлык на рабочий стол»).</li>
                                <li>Нажмите <b>«Добавить»</b>.</li>
                            </ol>
                        </div>

                        {/* Firefox */}
                        <div>
                            <p className="font-semibold text-blue-700 dark:text-blue-400 mb-1">Mozilla Firefox:</p>
                            <ol className="list-decimal pl-5 text-sm text-gray-700 dark:text-gray-300 space-y-1">
                                <li>Нажмите на <b>Три точки (⋮)</b> рядом с адресной строкой.</li>
                                <li>Выберите пункт <b>«Добавить на домашний экран»</b>.</li>
                                <li>Подтвердите добавление ярлыка.</li>
                            </ol>
                        </div>

                        {/* Samsung Internet */}
                        <div>
                            <p className="font-semibold text-blue-700 dark:text-blue-400 mb-1">Samsung Internet (Стандартный браузер):</p>
                            <ol className="list-decimal pl-5 text-sm text-gray-700 dark:text-gray-300 space-y-1">
                                <li>Нажмите на значок меню (<b>три горизонтальные полоски ≡</b> в правом нижнем углу).</li>
                                <li>Выберите пункт <b>«Добавить страницу в»</b>.</li>
                                <li>Выберите <b>«Домашний экран»</b> и нажмите «Добавить».</li>
                            </ol>
                        </div>

                        {/* Opera */}
                        <div>
                            <p className="font-semibold text-blue-700 dark:text-blue-400 mb-1">Opera / Opera GX:</p>
                            <ol className="list-decimal pl-5 text-sm text-gray-700 dark:text-gray-300 space-y-1">
                                <li>Нажмите на <b>Три точки (⋮)</b> в правом верхнем углу.</li>
                                <li>Прокрутите вниз и выберите <b>«Домашний экран»</b>.</li>
                                <li>Подтвердите действие.</li>
                            </ol>
                        </div>
                    </div>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}