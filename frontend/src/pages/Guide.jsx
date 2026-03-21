import { useNavigate, Link } from 'react-router-dom';

export default function Guide() {
  const navigate = useNavigate();
  const role = localStorage.getItem('user_role') || 'Гость';

  // Уровень доступа: чем выше, тем больше инструкций видит пользователь
  const roleLevels = { 'superadmin': 4, 'boss': 4, 'moderator': 3, 'foreman': 2, 'worker': 1, 'driver': 1, 'Гость': 0 };
  const level = roleLevels[role] || 0;

  const SectionTitle = ({ icon, title }) => (
      <h2 className="text-xl md:text-2xl font-bold text-gray-800 dark:text-white flex items-center mb-4 mt-10 border-b dark:border-gray-700 pb-2">
          <span className="text-2xl md:text-3xl mr-3">{icon}</span> {title}
      </h2>
  );

  const Block = ({ title, children, highlight }) => (
      <div className={`bg-white dark:bg-gray-800/50 p-5 rounded-xl border mb-4 shadow-sm hover:shadow-md transition-shadow ${highlight ? 'border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10' : 'border-gray-200 dark:border-gray-700'}`}>
          <h3 className="text-lg font-bold text-blue-700 dark:text-blue-400 mb-3">{title}</h3>
          <div className="text-gray-700 dark:text-gray-300 text-sm md:text-base space-y-3 leading-relaxed">
              {children}
          </div>
      </div>
  );

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-2 pb-20">

        {/* ВВОДНАЯ ЧАСТЬ */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl shadow-lg p-6 md:p-8 text-white mb-8 relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white opacity-10 rounded-full blur-2xl"></div>
            <h1 className="text-3xl md:text-4xl font-extrabold mb-3 relative z-10">База знаний</h1>
            <p className="text-blue-100 text-sm md:text-base max-w-2xl relative z-10">
                Подробное руководство по платформе «ВИКС Расписание». Здесь вы узнаете, как войти в систему, привязать мессенджеры, управлять нарядами и техникой.
            </p>
        </div>

        {/* РАЗДЕЛ 1: РЕГИСТРАЦИЯ И ВХОД */}
        <SectionTitle icon="🔐" title="Регистрация и Вход в систему" />

        <Block title="Для рабочих и водителей (Вход по ссылке)" highlight={true}>
            <p>Если вы рабочий или водитель, руководитель должен прислать вам специальную <b>ссылку-приглашение</b> (или код).</p>
            <ol className="list-decimal pl-5 space-y-2 mt-2">
                <li>Перейдите по ссылке, которую вам прислали.</li>
                <li>Откроется один из ботов (нажмите <b>Запустить / Start</b>):
                    <ul className="list-disc pl-5 mt-1 text-xs text-gray-500 dark:text-gray-400">
                        <li>Бот в Telegram: <a href="https://t.me/viksstroy_bot" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">@viksstroy_bot</a></li>
                        <li>Бот в MAX: <a href="https://max.ru/id222264297116_bot" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">Бот Расписания MAX</a></li>
                    </ul>
                </li>
                <li>Бот <b>автоматически</b> зарегистрирует вас и выдаст кнопку «Открыть платформу». Пароли не нужны!</li>
            </ol>
        </Block>

        <Block title="Как войти на сайт с компьютера? (Код авторизации)">
            <p>В целях безопасности вход через браузер на компьютере осуществляется по одноразовому коду.</p>
            <ol className="list-decimal pl-5 space-y-2 mt-2 font-medium">
                <li>Откройте бота <a href="https://max.ru/id222264297116_bot" className="text-blue-600 hover:underline">MAX</a> или <a href="https://t.me/viksstroy_bot" className="text-blue-600 hover:underline">Telegram</a> на телефоне.</li>
                <li>Отправьте боту команду <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-800 dark:text-gray-200">/web</code></li>
                <li>Бот пришлет вам <b>6-значный код</b> (например: 123456).</li>
                <li>Откройте сайт на компьютере и введите этот код на главном экране. Готово!</li>
            </ol>
        </Block>

        {/* РАЗДЕЛ 2: ПРОФИЛЬ И КОНТАКТЫ */}
        {level >= 1 && (
            <>
                <SectionTitle icon="👤" title="Профиль и Мессенджеры" />

                <Block title="Как привязать и Telegram, и MAX одновременно?">
                    <p>Платформа позволяет связать ваши аккаунты. Вы сможете открывать приложение из любого мессенджера, а уведомления о нарядах будут дублироваться.</p>
                    <ol className="list-decimal pl-5 space-y-2 mt-2 text-sm">
                        <li>Перейдите в нижнем меню платформы в раздел <b>«Профиль»</b>.</li>
                        <li>Прокрутите вниз до блока <b>«Привязка мессенджеров»</b>.</li>
                        <li>Зайдите в <i>новый</i> мессенджер (который хотите привязать) и отправьте боту команду <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">/web</code>.</li>
                        <li>Впишите полученный от нового бота код в поле на странице вашего Профиля и нажмите <b>«Привязать»</b>.</li>
                    </ol>
                </Block>

                <Block title="Ссылка-приглашение MAX (Для диалога)">
                    <p>Мессенджер MAX не позволяет писать в личку просто по ID. Чтобы коллеги могли связаться с вами в один клик прямо из наряда:</p>
                    <ul className="list-disc pl-5 space-y-2 mt-2 text-sm">
                        <li>Зайдите в свой профиль на платформе.</li>
                        <li>В поле <b>«Ссылка-приглашение MAX»</b> вставьте вашу личную ссылку на чат (ее можно скопировать в настройках самого приложения MAX).</li>
                        <li>Нажмите «Сохранить». Теперь в карточках нарядов коллеги смогут нажать на ваш профиль и сразу перейти в диалог.</li>
                    </ul>
                </Block>
            </>
        )}

        {/* РАЗДЕЛ 3: РАБОТА С НАРЯДАМИ (От прораба и выше) */}
        {level >= 2 && (
            <>
                <SectionTitle icon="📝" title="Работа с заявками (Для прорабов)" />

                <Block title="Создание новой заявки" highlight={true}>
                    <p>На главной странице (Дашборд) нажмите круглую синюю кнопку <b>«+ Создать»</b> в нижнем меню.</p>
                    <ol className="list-decimal pl-5 space-y-2 mt-2 text-sm">
                        <li><b>Дата и Адрес:</b> Укажите дату работ и точный адрес. Для удобства бот предложит вам последние 5 адресов, на которых вы работали.</li>
                        <li><b>Бригада и Состав:</b> Выберите вашу бригаду. Откроется список рабочих — <i>отметьте галочками</i> тех, кто реально выйдет на объект в этот день.</li>
                        <li><b>Техника:</b> Нажмите на нужную категорию (например, "Экскаваторы"), выберите конкретную машину и <b>обязательно укажите время её работы</b> (с 08:00 до 17:00).</li>
                        <li>Нажмите <b>«Отправить»</b>. Заявка уйдет на модерацию в офис.</li>
                    </ol>
                </Block>

                <Block title="Освобождение бригады (Статус «Свободен»)">
                    <p>Когда работы на объекте завершены, или бригада готова переехать на другой объект, прораб <b>обязан</b> освободить бригаду в системе.</p>
                    <ul className="list-disc pl-5 space-y-2 mt-2 text-sm border-l-2 border-emerald-500 ml-2 pl-4">
                        <li>На главной странице найдите текущий наряд в блоке «Текущие наряды».</li>
                        <li>Нажмите зеленую кнопку <b>«✅ Свободен (Освободить бригаду)»</b>.</li>
                        <li>В появившемся окне введите слово <code className="font-bold text-gray-900 dark:text-white uppercase bg-gray-100 dark:bg-gray-700 px-1 rounded">свободен</code> для подтверждения.</li>
                        <li><i>В офисе диспетчер сразу увидит, что ваша бригада зачеркнута в наряде и готова к новым задачам.</i></li>
                    </ul>
                </Block>
            </>
        )}

        {/* РАЗДЕЛ 4: РАБОТА С ТЕХНИКОЙ (Водители) */}
        {(role === 'driver' || level >= 3) && (
            <>
                <SectionTitle icon="🚜" title="Автопарк (Для водителей)" />

                <Block title="Как работает статус «Свободен»?">
                    <p>Как только вы выполнили свою работу на объекте, вам необходимо отчитаться диспетчеру.</p>
                    <ul className="list-disc pl-5 space-y-2 mt-2 text-sm">
                        <li>Зайдите на главную страницу платформы (или откройте вкладку «Мои заявки»).</li>
                        <li>Найдите карточку объекта, на котором вы сейчас находитесь.</li>
                        <li>Нажмите кнопку <b>«✅ Свободен»</b> под вашим нарядом.</li>
                        <li>Система попросит ввести слово <code className="font-bold text-gray-900 dark:text-white uppercase bg-gray-100 dark:bg-gray-700 px-1 rounded">свободен</code>.</li>
                        <li>После этого ваша машина в наряде зачеркнется, а диспетчер получит уведомление, что вас можно отправлять на другой объект.</li>
                    </ul>
                </Block>
            </>
        )}

        {/* РАЗДЕЛ 5: МОДЕРАЦИЯ (От модератора и выше) */}
        {level >= 3 && (
            <>
                <SectionTitle icon="⚖️" title="Офис и Модерация" />

                <Block title="Управление заявками и Публикация" highlight={true}>
                    <p>Вкладка <b>«Заявки»</b> в нижнем меню — это ваш главный пульт управления.</p>
                    <ul className="list-disc pl-5 space-y-3 mt-2 text-sm">
                        <li><b>Одобрение:</b> При клике на заявку "На модерации" вы можете её Одобрить или Отклонить (с указанием причины для прораба).</li>
                        <li><b>Массовая публикация:</b> Все одобренные заявки скапливаются в средней колонке. Нажмите <b>«📤 Опубликовать»</b>, отфильтруйте нужную дату (например, завтрашний день), отметьте все наряды и опубликуйте их разом. Система сгенерирует картинки-наряды и разошлет их всем участникам в ЛС.</li>
                        <li><b>Интерактивность:</b> Если нужно связаться с прорабом, просто <i>нажмите на его имя</i> внутри карточки наряда — откроется его профиль с прямыми ссылками на Telegram или MAX. То же самое работает для рабочих и техники.</li>
                    </ul>
                </Block>

                <Block title="Глобальные настройки автоматизации">
                    <p>На вкладке <b>«Система»</b> вы можете настроить автоматические процессы (Таймеры указываются по времени г. Барнаула):</p>
                    <ul className="list-disc pl-5 space-y-1 mt-2 text-sm">
                        <li><b>Авто-старт:</b> Время, когда опубликованные наряды переходят в статус "В работе".</li>
                        <li><b>Авто-завершение:</b> Время, когда активные наряды завершаются и запрашивают у прораба отчет.</li>
                        <li><b>Напоминания:</b> Вечернее время рассылки PUSH-уведомлений прорабам о необходимости сдать заявки.</li>
                    </ul>
                </Block>
            </>
        )}

        {/* РАЗДЕЛ 6: PWA (Видят все) */}
        {level >= 1 && (
            <>
                <SectionTitle icon="📱" title="Установка на телефон (Приложение)" />
                <p className="text-gray-600 dark:text-gray-400 mb-4 px-2 text-sm">
                    Платформа работает значительно быстрее и удобнее, если установить её на экран смартфона как отдельное приложение.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center mb-3">🍎 Apple (iPhone)</h3>
                        <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                            <li>Откройте сайт в браузере <b>Safari</b>.</li>
                            <li>Нажмите значок <b>«Поделиться»</b> (квадрат со стрелкой вверх) внизу экрана.</li>
                            <li>Выберите пункт <b>«На экран "Домой"»</b> ➕.</li>
                            <li>Нажмите синюю кнопку <b>«Добавить»</b>.</li>
                        </ol>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center mb-3">🤖 Android</h3>
                        <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                            <li>Откройте сайт в браузере <b>Chrome / Яндекс</b>.</li>
                            <li>Нажмите на <b>Три точки (⋮)</b> в углу экрана.</li>
                            <li>Выберите пункт <b>«Добавить на гл. экран»</b> (или «Установить приложение»).</li>
                            <li>Подтвердите установку.</li>
                        </ol>
                    </div>
                </div>
            </>
        )}

    </main>
  );
}