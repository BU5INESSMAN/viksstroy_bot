import { useNavigate, Link } from 'react-router-dom';

export default function Guide() {
  const navigate = useNavigate();
  const role = localStorage.getItem('user_role') || 'Гость';

  // Уровень доступа: чем выше, тем больше инструкций видит пользователь
  const roleLevels = { 'superadmin': 4, 'boss': 4, 'moderator': 3, 'foreman': 2, 'worker': 1, 'driver': 1, 'Гость': 0 };
  const level = roleLevels[role] || 0;

  const SectionTitle = ({ icon, title }) => (
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center mb-4 mt-10 border-b dark:border-gray-700 pb-2">
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
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen text-gray-800 dark:text-gray-100 p-4 sm:p-8 transition-colors duration-200 font-sans pb-24">
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
            Добро пожаловать в справочное руководство <b>«ВИКС Расписание»</b>.
            {level > 0 ? ` Ниже отображены функции, доступные для вашей должности: ${role}.` : ' Войдите в систему, чтобы получить доступ к полному функционалу.'}
        </p>

        {/* ============================================================== */}
        {/* УРОВЕНЬ 0: БАЗОВАЯ ИНФОРМАЦИЯ (ВИДЯТ ВСЕ, ДАЖЕ ГОСТИ) */}
        {/* ============================================================== */}
        <SectionTitle icon="🔐" title="Регистрация и Вход в систему" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Block title="Вход через Telegram (Web)">
                <p>Откройте сайт в любом браузере. Нажмите на синюю кнопку <b>«Log in with Telegram»</b>.</p>
                <p>Если вы заходите впервые, система попросит ввести системный пароль. Пароль выдается руководством и определяет вашу должность.</p>
                <ActionLink to="/" text="странице входа" />
            </Block>

            <Block title="Вход через Telegram Mini App (Бот)">
                <p>В нашем Telegram-боте нажмите кнопку <b>«📱 Открыть платформу»</b>. Приложение откроется прямо внутри мессенджера без необходимости вводить номер телефона.</p>
            </Block>

            <Block title="Вход по приглашению (Для рабочих)">
                <p>Рабочим и водителям <b>не нужен пароль</b>. Вы получаете специальную ссылку от руководства.</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
                    <li>Перейдите по ссылке.</li>
                    <li>Авторизуйтесь через Telegram.</li>
                    <li>Выберите своё ФИО из предложенного списка бригады или техники.</li>
                    <li>Ваш аккаунт будет автоматически привязан!</li>
                </ul>
            </Block>

            <Block title="Сэндвич-меню и Профиль">
                <p>В правом верхнем углу (иконка с тремя полосками) находится главное меню. Там можно сменить тему, посмотреть обновления и открыть <b>Мой профиль</b>.</p>
                <p>В профиле можно установить свою фотографию. <i>Изменение ФИО и должности доступно только руководству.</i></p>
            </Block>
        </div>

        {/* ============================================================== */}
        {/* УРОВЕНЬ 1: РАБОЧИЕ И ВОДИТЕЛИ */}
        {/* ============================================================== */}
        {level >= 1 && (
            <>
                <SectionTitle icon="👷" title="Инструкция для сотрудников" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Block title="Как узнать, куда ехать?">
                        <p>На <b>Главной странице</b> в блоке «Текущие наряды» всегда отображаются ваши подтвержденные заявки.</p>
                        <p>Также система автоматически присылает уведомления в Telegram:</p>
                        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
                            <li>Когда вас добавили в утвержденный наряд.</li>
                            <li><b>В 08:00 утра</b> в день смены — сообщение о старте работы.</li>
                        </ul>
                    </Block>

                    <Block title="Для водителей техники (ОЧЕНЬ ВАЖНО!)">
                        <p>Пока вы находитесь в наряде, ваша техника считается <b>Занятой</b> и другие прорабы не могут её выбрать.</p>
                        <p>Как только вы закончили работу на объекте, вы <b>ОБЯЗАНЫ</b> зайти на Главную страницу и нажать большую зеленую кнопку <b>«✅ Готово (Освободить технику)»</b>.</p>
                        <p><i>Если время по графику выйдет, а вы не нажали кнопку, бот пришлет вам предупреждение!</i></p>
                    </Block>
                </div>
            </>
        )}

        {/* ============================================================== */}
        {/* УРОВЕНЬ 2: ПРОРАБЫ */}
        {/* ============================================================== */}
        {level >= 2 && (
            <>
                <SectionTitle icon="🏗" title="Оформление нарядов (Для Прорабов)" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Block title="Создание новой заявки">
                        <p>Нажмите на синюю кнопку <b>«+» (Создать)</b> в нижнем меню.</p>
                        <ol className="list-decimal pl-5 mt-2 space-y-1 text-sm">
                            <li>Укажите Дату и Адрес (бот запоминает ваши последние адреса).</li>
                            <li><b>Бригады:</b> Вы можете кликнуть на <b>сразу несколько бригад</b>, если на объекте нужны разные специалисты. Затем снимите галочки с рабочих, которые сегодня не нужны.</li>
                            <li><b>Техника:</b> Выберите нужные машины и <b>обязательно укажите время работы</b> (со скольки до скольки). Занятые или сломанные машины выбрать нельзя.</li>
                            <li>Нажмите Отправить.</li>
                        </ol>
                    </Block>

                    <Block title="Редактирование заявок">
                        <p>Ошиблись при заполнении? Ничего страшного!</p>
                        <p>Пока модератор не проверил заявку (она висит в статусе <b>«На модерации»</b>), вы можете нажать на неё в Канбан-доске и выбрать желтую кнопку <b>«✏️ Редактировать»</b>.</p>
                        <p><i>После одобрения редактировать наряд нельзя — придется просить модератора его отозвать.</i></p>
                    </Block>
                </div>
            </>
        )}

        {/* ============================================================== */}
        {/* УРОВЕНЬ 3: МОДЕРАТОРЫ */}
        {/* ============================================================== */}
        {level >= 3 && (
            <>
                <SectionTitle icon="🛡" title="Модерация и Управление" />
                <div className="space-y-4">
                    <Block title="Проверка и Управление статусами">
                        <p>Все заявки от прорабов попадают на страницу <b>«Заявки»</b>.</p>
                        <ul className="list-disc pl-5 mt-2 space-y-2 text-sm">
                            <li><b>Одобрение:</b> Кликните по заявке и нажмите ✅ Одобрить.</li>
                            <li><b>Отзыв:</b> Если заявка уже одобрена, но планы изменились, её можно <b>«🔙 Отозвать»</b> обратно в статус отклоненных.</li>
                            <li><b>Завершение:</b> Если работа выполнена досрочно, нажмите <b>«🏁 Завершить наряд»</b> в уже опубликованной заявке. Техника моментально станет свободной!</li>
                        </ul>
                    </Block>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Block title="Канбан-доска (Как она работает?)">
                            <p>Заявки автоматически меняют колонки в зависимости от текущего дня:</p>
                            <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
                                <li><b>Одобрены:</b> Здесь лежат наряды, которые вы подтвердили, а также те, которые уже опубликованы в группу, но их <b>дата еще не наступила</b> (будущие смены).</li>
                                <li><b>В работе:</b> Сюда наряды попадают <b>строго в день выезда</b>.</li>
                            </ul>
                        </Block>

                        <Block title="Мульти-публикация в Telegram">
                            <p>Нажмите зеленую кнопку <b>«📤 Опубликовать»</b> сверху. Откроется окно со списком всех готовых нарядов.</p>
                            <p>Вы можете <b>отфильтровать их по дате</b> и отметить галочками только те, которые хотите выложить в рабочую группу прямо сейчас.</p>
                        </Block>
                    </div>
                </div>
            </>
        )}

        {/* ============================================================== */}
        {/* УРОВЕНЬ 4: АДМИНЫ И БОССЫ */}
        {/* ============================================================== */}
        {level >= 4 && (
            <>
                <SectionTitle icon="⚙️" title="Глобальное администрирование" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Block title="Настройки автоматизации">
                        <p>В разделе <b>«Система»</b> босс может включить авто-пилот:</p>
                        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
                            <li><b>Авто-публикация:</b> Задайте время (например, 07:00), и бот сам отправит в Telegram-группу все одобренные наряды, у которых дата совпадает с сегодняшним днем.</li>
                            <li><b>Напоминания:</b> Бот будет присылать прорабам уведомления о необходимости сдать наряды (с возможностью отключить это на выходные дни).</li>
                        </ul>
                    </Block>

                    <Block title="Полное удаление данных (Осторожно!)">
                        <p>Вам выданы максимальные права для очистки базы данных:</p>
                        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
                            <li><b>Удаление пользователей:</b> Откройте профиль любого сотрудника в Системе и нажмите красную кнопку «Удалить профиль».</li>
                            <li><b>Удаление бригад:</b> В управлении бригадами нажмите «Удалить бригаду». Все участники будут отвязаны, но архив прошлых нарядов сохранится.</li>
                        </ul>
                    </Block>
                </div>
            </>
        )}

        {/* ============================================================== */}
        {/* УСТАНОВКА PWA (ДЛЯ ВСЕХ) */}
        {/* ============================================================== */}
        <SectionTitle icon="📱" title="Установка на экран телефона (Приложение)" />
        <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-xl border border-blue-200 dark:border-blue-800 shadow-sm mb-8">
            <p className="mb-6 text-gray-700 dark:text-gray-300">
                Вы можете установить нашу платформу прямо на рабочий стол вашего смартфона. Она будет открываться как полноценное приложение на весь экран.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="font-bold text-xl text-gray-900 dark:text-white flex items-center mb-4 border-b dark:border-gray-700 pb-2">
                        🍎 Устройства Apple (iOS)
                    </h3>
                    <p className="font-semibold text-blue-700 dark:text-blue-400 mb-2">Браузер Safari (Рекомендуется):</p>
                    <ol className="list-decimal pl-5 space-y-3 text-sm text-gray-700 dark:text-gray-300">
                        <li>Откройте сайт платформы в браузере <b>Safari</b>.</li>
                        <li>В самом низу экрана по центру нажмите значок <b>«Поделиться»</b> (квадрат со стрелочкой ⬆️).</li>
                        <li>Прокрутите немного вниз и выберите <b>«На экран "Домой"»</b> ➕.</li>
                        <li>Нажмите синюю кнопку <b>«Добавить»</b>.</li>
                    </ol>
                </div>

                <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="font-bold text-xl text-gray-900 dark:text-white flex items-center mb-4 border-b dark:border-gray-700 pb-2">
                        🤖 Устройства Android
                    </h3>
                    <p className="font-semibold text-blue-700 dark:text-blue-400 mb-2">Google Chrome / Яндекс:</p>
                    <ol className="list-decimal pl-5 space-y-3 text-sm text-gray-700 dark:text-gray-300">
                        <li>Нажмите на <b>Три точки (⋮)</b> в верхнем или нижнем углу браузера.</li>
                        <li>В меню выберите пункт <b>«Добавить на главный экран»</b> (или «Ярлык на рабочий стол»).</li>
                        <li>Подтвердите действие, нажав <b>«Добавить»</b>.</li>
                    </ol>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}