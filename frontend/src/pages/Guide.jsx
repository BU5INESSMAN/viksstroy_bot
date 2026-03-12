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
            Добро пожаловать в справочное руководство <b>«ВИКС Расписание»</b>. Здесь подробно описаны все возможности Web-платформы и Telegram-бота для каждой должности.
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
                <p>В Telegram-боте нажмите кнопку <b>«Меню платформы»</b> (слева внизу). Приложение откроется прямо внутри мессенджера без необходимости вводить логин.</p>
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
                    <li>Генерация пригласительных ссылок для привязки рабочих к боту.</li>
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
                    <li><b>Панель управления техникой:</b> добавление автопарка по категориям, отправка техники «В ремонт» (отключение из списков выбора).</li>
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

            <Block title="Управление Автопарком">
                <p>Руководство может добавлять новую технику, выбирая стандартные категории (Кран, Экскаватор) или создавая свои через кнопку <b>«Другое»</b>.</p>
                <p>Если машина сломалась, нажмите кнопку <b>«В ремонт»</b> — она сразу же исчезнет из формы создания заявки у прорабов, чтобы предотвратить ошибки планирования.</p>
            </Block>
        </div>

        {/* 4. ТЕЛЕГРАМ БОТ */}
        <SectionTitle icon="🤖" title="Telegram Бот (@viksstroy_bot)" />
        <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-xl border border-blue-200 dark:border-blue-800 shadow-sm">
            <p className="mb-4">Наш Telegram-бот — это связующее звено между рабочими объектами и Web-системой. Он выполняет несколько ключевых функций:</p>

            <div className="space-y-4">
                <div>
                    <h4 className="font-bold text-gray-800 dark:text-gray-200 flex items-center"><span className="mr-2">📲</span> 1. Уведомления и Рассылки</h4>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Все утвержденные модератором наряды автоматически публикуются ботом в главную рабочую группу. Текст сообщения красиво отформатирован, содержит эмодзи, адреса, точное время техники и список <b>только тех рабочих</b>, которые были выбраны на выезд.</p>
                </div>

                <div>
                    <h4 className="font-bold text-gray-800 dark:text-gray-200 flex items-center"><span className="mr-2">🔗</span> 2. Инвайт-система</h4>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Если рабочий переходит по Telegram-ссылке приглашения (вида <code>t.me/viksstroy_bot?start=team_XXX</code>), бот автоматически приветствует его, показывает название бригады и выдает интерактивные кнопки для привязки аккаунта в один клик.</p>
                </div>

                <div>
                    <h4 className="font-bold text-gray-800 dark:text-gray-200 flex items-center"><span className="mr-2">📱</span> 3. Mini App Integration</h4>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Кнопка «Меню платформы» (или Web App кнопка рядом со скрепкой) открывает этот сайт в виде всплывающего окна внутри Telegram. Система мгновенно считывает ваш <code>telegram_id</code>, аватарку и пускает в дашборд без ввода логинов и паролей.</p>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}