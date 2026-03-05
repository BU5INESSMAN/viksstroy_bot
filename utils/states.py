from aiogram.fsm.state import State, StatesGroup

class AuthStates(StatesGroup):
    wait_for_password = State()
    wait_for_fio = State()

class TeamStates(StatesGroup):
    main_menu = State()
    edit_team = State()
    wait_for_name = State()
    wait_for_leader = State()
    wait_for_member = State()
    wait_for_pos = State()
    wait_for_member_fio = State()
    wait_for_member_pos = State()

class AppStates(StatesGroup):
    wait_for_object = State()
    select_team = State()
    select_members = State()
    select_category = State()
    select_equipment = State()
    select_date = State()
    wait_for_comment = State()