CLASS ltd_allow_all DEFINITION FINAL FOR TESTING.
  PUBLIC SECTION.
    INTERFACES /kro/if_layo_auth.
    DATA mv_last_action TYPE string.
ENDCLASS.


CLASS ltd_allow_all IMPLEMENTATION.

  METHOD /kro/if_layo_auth~check_authorized.
    mv_last_action = action.
    result = abap_true.
  ENDMETHOD.

ENDCLASS.


CLASS ltcl_default DEFINITION FINAL FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    DATA mi_cut TYPE REF TO /kro/if_layo_auth.

    METHODS setup.
    METHODS teardown.
    METHODS own_save_allowed FOR TESTING.
    METHODS own_save_other_user_denied FOR TESTING.
    METHODS shared_save_allowed FOR TESTING.
    METHODS delete_own_allowed FOR TESTING.
    METHODS delete_other_denied FOR TESTING.
    METHODS delete_shared_allowed FOR TESTING.
    METHODS read_others_denied FOR TESTING.
    METHODS read_own_allowed FOR TESTING.
    METHODS unknown_action_denied FOR TESTING.
    METHODS injected_instance_decides FOR TESTING.
    METHODS unset_restores_default FOR TESTING.
ENDCLASS.


CLASS ltcl_default IMPLEMENTATION.

  METHOD setup.
    CREATE OBJECT mi_cut TYPE /kro/cl_layo_auth.
  ENDMETHOD.

  METHOD teardown.
    /kro/cl_layo_auth=>set_instance( ).
  ENDMETHOD.

  METHOD own_save_allowed.

    DATA ls_head TYPE /kro/t_11.
    ls_head-uname = sy-uname.

    cl_abap_unit_assert=>assert_equals(
      act = mi_cut->check_authorized( action = /kro/if_layo_auth=>cs_action-save_own
                                      head   = ls_head )
      exp = abap_true ).

  ENDMETHOD.

  METHOD own_save_other_user_denied.

    DATA ls_head TYPE /kro/t_11.
    ls_head-uname = 'SOMEBODY'.

    cl_abap_unit_assert=>assert_equals(
      act = mi_cut->check_authorized( action = /kro/if_layo_auth=>cs_action-save_own
                                      head   = ls_head )
      exp = abap_false ).

  ENDMETHOD.

  METHOD shared_save_allowed.

    DATA ls_head TYPE /kro/t_11.

    cl_abap_unit_assert=>assert_equals(
      act = mi_cut->check_authorized( action = /kro/if_layo_auth=>cs_action-save_shared
                                      head   = ls_head )
      exp = abap_true ).

  ENDMETHOD.

  METHOD delete_own_allowed.

    DATA ls_head TYPE /kro/t_11.
    ls_head-uname = sy-uname.

    cl_abap_unit_assert=>assert_equals(
      act = mi_cut->check_authorized( action = /kro/if_layo_auth=>cs_action-delete
                                      head   = ls_head )
      exp = abap_true ).

  ENDMETHOD.

  METHOD delete_other_denied.

    DATA ls_head TYPE /kro/t_11.
    ls_head-uname = 'SOMEBODY'.

    cl_abap_unit_assert=>assert_equals(
      act = mi_cut->check_authorized( action = /kro/if_layo_auth=>cs_action-delete
                                      head   = ls_head )
      exp = abap_false ).

  ENDMETHOD.

  METHOD delete_shared_allowed.

    DATA ls_head TYPE /kro/t_11.

    cl_abap_unit_assert=>assert_equals(
      act = mi_cut->check_authorized( action = /kro/if_layo_auth=>cs_action-delete
                                      head   = ls_head )
      exp = abap_true ).

  ENDMETHOD.

  METHOD read_others_denied.

    DATA ls_head TYPE /kro/t_11.
    ls_head-uname = 'LTCL_OTHER'.

    cl_abap_unit_assert=>assert_equals(
      act = mi_cut->check_authorized( action = /kro/if_layo_auth=>cs_action-read_others
                                      head   = ls_head )
      exp = abap_false ).

  ENDMETHOD.

  METHOD read_own_allowed.

    DATA ls_head TYPE /kro/t_11.
    ls_head-uname = sy-uname.

    cl_abap_unit_assert=>assert_equals(
      act = mi_cut->check_authorized( action = /kro/if_layo_auth=>cs_action-read_others
                                      head   = ls_head )
      exp = abap_true ).

  ENDMETHOD.

  METHOD unknown_action_denied.

    DATA ls_head TYPE /kro/t_11.
    ls_head-uname = sy-uname.

    cl_abap_unit_assert=>assert_equals(
      act = mi_cut->check_authorized( action = `ANYTHING`
                                      head   = ls_head )
      exp = abap_false ).

  ENDMETHOD.

  METHOD injected_instance_decides.

    DATA ls_head TYPE /kro/t_11.

    DATA lo_allow TYPE REF TO ltd_allow_all.
    CREATE OBJECT lo_allow TYPE ltd_allow_all.
    /kro/cl_layo_auth=>set_instance( lo_allow ).

    cl_abap_unit_assert=>assert_equals(
      act = /kro/cl_layo_auth=>check( action = /kro/if_layo_auth=>cs_action-save_shared
                                       head   = ls_head )
      exp = abap_true ).
    cl_abap_unit_assert=>assert_equals(
      act = lo_allow->mv_last_action
      exp = /kro/if_layo_auth=>cs_action-save_shared ).

  ENDMETHOD.

  METHOD unset_restores_default.

    DATA lo_allow TYPE REF TO ltd_allow_all.
    DATA li_auth TYPE REF TO /kro/if_layo_auth.
    DATA temp1 TYPE xsdboolean.
    CREATE OBJECT lo_allow TYPE ltd_allow_all.
    /kro/cl_layo_auth=>set_instance( lo_allow ).
    /kro/cl_layo_auth=>set_instance( ).

    " the default again - either the shipped class or a system's own
    " implementation

    li_auth = /kro/cl_layo_auth=>get_instance( ).
    cl_abap_unit_assert=>assert_bound( li_auth ).

    temp1 = boolc( li_auth <> lo_allow ).
    cl_abap_unit_assert=>assert_true( temp1 ).

  ENDMETHOD.

ENDCLASS.
